import {
  useMemo,
  useRef,
  useState,
  useEffect,
  type PointerEvent,
  type ReactNode,
  type WheelEvent,
} from 'react';

import {
  buildWorkflowGraph,
  nodeTypeClass,
  workflow08StateTypes,
  type GraphEdge,
  type GraphNode,
  type WorkflowGraph,
} from './graph';
import {
  applyGraphLayout,
  loadGraphLayout,
  saveGraphLayout,
  snapToGrid,
  type GraphLayout,
} from './graph-layout';
import { applyStateDeletions, applyStateOperation, applyTransitionConnection } from './state-patch';
import { formatBytes, type DocumentResponse } from './workspace';

type GraphViewProps = {
  document: DocumentResponse;
  source: string;
  onChange: (source: string) => void;
  onSourceLine: (line: number) => void;
  onOpenForm: (stateName: string) => void;
  onExtractRange: (stateNames: string[]) => void;
};
type Selection = { kind: 'node' | 'edge'; id: string };
type Pan = { x: number; y: number };
type Drag = { x: number; y: number; pan: Pan };
type NodeDrag = { id: string; x: number; y: number; startX: number; startY: number };

export function GraphView({
  document,
  source,
  onChange,
  onSourceLine,
  onOpenForm,
  onExtractRange,
}: GraphViewProps): ReactNode {
  const graph = useMemo(() => buildWorkflowGraph(document, source), [document, source]);
  const layoutKey = `studio.graph-layout.v1:${document.id}`;
  const [layout, setLayout] = useState<GraphLayout>(() =>
    loadGraphLayout(typeof window === 'undefined' ? null : window.localStorage, layoutKey),
  );
  const displayGraph = useMemo(() => applyGraphLayout(graph, layout), [graph, layout]);
  const [selection, setSelection] = useState<Selection | null>(() => defaultSelection(graph));
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>(() => {
    const initial = defaultSelection(graph);
    const initialNode =
      initial?.kind === 'node' ? graph.nodes.find((node) => node.id === initial.id) : null;
    return initialNode?.kind === 'state' ? [initialNode.id] : [];
  });
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<Pan>({ x: 0, y: 0 });
  const [showMinimap, setShowMinimap] = useState(true);
  const [textMode, setTextMode] = useState(false);
  const [connectFrom, setConnectFrom] = useState('');
  const [connectTo, setConnectTo] = useState('');
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [newStateName, setNewStateName] = useState('');
  const [newStateType, setNewStateType] = useState<string>(workflow08StateTypes[0]);
  const [paletteError, setPaletteError] = useState<string | null>(null);
  const [graphEditError, setGraphEditError] = useState<string | null>(null);
  const drag = useRef<Drag | null>(null);
  const nodeDrag = useRef<NodeDrag | null>(null);
  const dimensions = graphDimensions(displayGraph);
  const selectedNode = selection?.kind === 'node' ? findNode(displayGraph, selection.id) : null;
  const selectedEdge =
    selection?.kind === 'edge'
      ? (displayGraph.edges.find((edge) => edge.id === selection.id) ?? null)
      : null;
  const stateNodes = displayGraph.nodes.filter((node) => node.kind === 'state');
  const stateNames = stateNodes.map((node) => node.label);
  const selectedStateNames = selectedNodeIds.flatMap((id) => {
    const node = displayGraph.nodes.find((item) => item.id === id);
    return node?.kind === 'state' ? [node.label] : [];
  });
  const sourceState = stateNames.includes(connectFrom) ? connectFrom : (stateNames[0] ?? '');
  const targetState = stateNames.includes(connectTo)
    ? connectTo
    : (stateNames.find((name) => name !== sourceState) ?? '');

  useEffect(() => {
    saveGraphLayout(typeof window === 'undefined' ? null : window.localStorage, layoutKey, layout);
  }, [layout, layoutKey]);

  const resetViewport = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };
  const changeZoom = (delta: number) => setZoom((current) => clamp(current + delta, 0.5, 2.5));
  const selectNext = (direction: 1 | -1) => {
    const selectable = displayGraph.nodes;
    if (selectable.length === 0) return;
    const currentIndex = Math.max(
      0,
      selectable.findIndex((node) => node.id === selection?.id),
    );
    const next = selectable[(currentIndex + direction + selectable.length) % selectable.length];
    if (next) {
      setSelection({ kind: 'node', id: next.id });
      setSelectedNodeIds([next.id]);
    }
  };
  const selectNode = (node: GraphNode, multi = false) => {
    setSelection({ kind: 'node', id: node.id });
    setSelectedNodeIds((current) => {
      if (!multi) return [node.id];
      return current.includes(node.id)
        ? current.filter((id) => id !== node.id)
        : [...current, node.id];
    });
  };
  const onCanvasKeyDown = (event: React.KeyboardEvent<SVGSVGElement>) => {
    if ((event.key === 'Delete' || event.key === 'Backspace') && selectedNodeIds.length > 0) {
      event.preventDefault();
      deleteSelectedStates();
      return;
    }
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault();
      selectNext(1);
    }
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault();
      selectNext(-1);
    }
  };
  const onPointerDown = (event: PointerEvent<SVGSVGElement>) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, y: event.clientY, pan };
  };
  const onPointerMove = (event: PointerEvent<SVGSVGElement>) => {
    if (!drag.current) return;
    const next = {
      x: drag.current.pan.x + event.clientX - drag.current.x,
      y: drag.current.pan.y + event.clientY - drag.current.y,
    };
    setPan(next);
  };
  const onPointerUp = (event: PointerEvent<SVGSVGElement>) => {
    if (drag.current) event.currentTarget.releasePointerCapture(event.pointerId);
    drag.current = null;
  };
  const onNodePointerDown = (event: PointerEvent<SVGGElement>, node: GraphNode) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    selectNode(node, event.shiftKey);
    nodeDrag.current = {
      id: node.id,
      x: node.x,
      y: node.y,
      startX: event.clientX,
      startY: event.clientY,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onNodePointerMove = (event: PointerEvent<SVGGElement>) => {
    if (!nodeDrag.current) return;
    const bounds = event.currentTarget.ownerSVGElement?.getBoundingClientRect();
    if (!bounds) return;
    const scaleX = dimensions.width / Math.max(bounds.width, 1) / zoom;
    const scaleY = dimensions.height / Math.max(bounds.height, 1) / zoom;
    setLayout((current) => ({
      ...current,
      [nodeDrag.current!.id]: {
        x: snapToGrid(nodeDrag.current!.x + (event.clientX - nodeDrag.current!.startX) * scaleX),
        y: snapToGrid(nodeDrag.current!.y + (event.clientY - nodeDrag.current!.startY) * scaleY),
      },
    }));
  };
  const onNodePointerUp = (event: PointerEvent<SVGGElement>) => {
    if (nodeDrag.current) event.currentTarget.releasePointerCapture(event.pointerId);
    nodeDrag.current = null;
  };
  const nudgeNode = (node: GraphNode, dx: number, dy: number) => {
    setLayout((current) => ({
      ...current,
      [node.id]: {
        x: snapToGrid((current[node.id]?.x ?? node.x) + dx),
        y: snapToGrid((current[node.id]?.y ?? node.y) + dy),
      },
    }));
    selectNode(node);
  };
  const resetAutoLayout = () => {
    setLayout({});
    resetViewport();
  };
  const onWheel = (event: WheelEvent<SVGSVGElement>) => {
    event.preventDefault();
    changeZoom(event.deltaY < 0 ? 0.1 : -0.1);
  };
  const connectStates = () => {
    const result = applyTransitionConnection(source, document.format, sourceState, targetState);
    setConnectionError(result.error);
    if (!result.error) onChange(result.source);
  };
  const addPaletteState = () => {
    const result = applyStateOperation(source, document.format, {
      kind: 'create',
      name: newStateName.trim(),
      type: newStateType,
    });
    setPaletteError(result.error);
    if (!result.error) {
      onChange(result.source);
      setNewStateName('');
    }
  };
  function deleteSelectedStates() {
    const names = selectedNodeIds.flatMap((id) => {
      const node = displayGraph.nodes.find((item) => item.id === id);
      return node?.kind === 'state' ? [node.label] : [];
    });
    const result = applyStateDeletions(source, document.format, names);
    setGraphEditError(result.error);
    if (!result.error) {
      onChange(result.source);
      setSelectedNodeIds([]);
      setSelection(null);
    }
  }

  return (
    <section className="graph-view" aria-labelledby="graph-title">
      <div className="graph-toolbar">
        <div>
          <p className="eyebrow">Workflow graph · editable draft</p>
          <h2 id="graph-title">{document.displayName}</h2>
        </div>
        <div className="graph-actions" role="toolbar" aria-label="Graph controls">
          <button
            className="icon-button"
            type="button"
            onClick={() => changeZoom(-0.1)}
            aria-label="Zoom out"
          >
            −
          </button>
          <span className="graph-zoom" aria-live="polite">
            {Math.round(zoom * 100)}%
          </span>
          <button
            className="icon-button"
            type="button"
            onClick={() => changeZoom(0.1)}
            aria-label="Zoom in"
          >
            +
          </button>
          <button className="button button-secondary" type="button" onClick={resetViewport}>
            Fit
          </button>
          <button className="button button-secondary" type="button" onClick={resetAutoLayout}>
            Auto-layout
          </button>
          <button
            className={`button button-secondary ${showMinimap ? 'is-active' : ''}`}
            type="button"
            onClick={() => setShowMinimap((current) => !current)}
            aria-pressed={showMinimap}
          >
            Minimap
          </button>
          <button
            className={`button button-secondary ${textMode ? 'is-active' : ''}`}
            type="button"
            onClick={() => setTextMode((current) => !current)}
            aria-pressed={textMode}
          >
            {textMode ? 'Canvas view' : 'Text view'}
          </button>
          <button
            className="button button-danger"
            type="button"
            onClick={deleteSelectedStates}
            disabled={selectedNodeIds.length === 0}
            aria-keyshortcuts="Delete"
          >
            Delete selected ({selectedNodeIds.length})
          </button>
          <button
            className="button button-primary"
            type="button"
            onClick={() => onExtractRange(selectedStateNames)}
            disabled={selectedStateNames.length === 0}
          >
            Extract selected range
          </button>
        </div>
      </div>
      <div className="graph-status" role="status">
        {graph.nodes.length} nodes · {graph.edges.length} relationships ·{' '}
        {formatBytes(document.sizeBytes)}
      </div>
      <p className="graph-layout-status" role="status">
        Drag nodes or use arrow keys to move them · positions snap to a 24px grid · saved as
        Studio-only layout metadata
      </p>
      {selectedNodeIds.length > 1 && (
        <p className="graph-selection-status" role="status">
          {selectedNodeIds.length} states selected · Shift-click to toggle selection
        </p>
      )}
      {graphEditError && (
        <p className="form-error" role="alert">
          {graphEditError}
        </p>
      )}
      {graph.warnings.length > 0 && (
        <div className="graph-warnings" role="status" aria-label="Graph warnings">
          <strong>Review warnings</strong>
          <ul>
            {graph.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      )}
      {graph.supported && document.compatibility !== 'source-readonly' && (
        <section className="graph-palette" aria-labelledby="graph-palette-title">
          <div>
            <p className="eyebrow">Compatibility-filtered palette</p>
            <h3 id="graph-palette-title">State palette</h3>
            <p className="muted-copy">
              Serverless Workflow 0.8 authoring profile · unsupported runtime-specific types are
              intentionally excluded from this palette.
            </p>
          </div>
          <div className="graph-palette-types" role="toolbar" aria-label="Supported state types">
            {workflow08StateTypes.map((type) => (
              <button
                className={`button button-secondary ${newStateType === type ? 'is-active' : ''}`}
                type="button"
                aria-pressed={newStateType === type}
                key={type}
                onClick={() => {
                  setNewStateType(type);
                  setPaletteError(null);
                }}
              >
                {type}
              </button>
            ))}
          </div>
          <div className="graph-palette-create">
            <label>
              <span>New state name</span>
              <input
                aria-label="New graph state name"
                value={newStateName}
                onChange={(event) => {
                  setNewStateName(event.target.value);
                  setPaletteError(null);
                }}
                placeholder="Review result"
              />
            </label>
            <button className="button button-primary" type="button" onClick={addPaletteState}>
              Add {newStateType} state
            </button>
          </div>
          {paletteError && (
            <p className="form-error" role="alert">
              {paletteError}
            </p>
          )}
        </section>
      )}
      {stateNames.length > 1 && (
        <section className="graph-connection-editor" aria-labelledby="graph-connection-title">
          <div>
            <p className="eyebrow">Transition authoring</p>
            <h3 id="graph-connection-title">Add a direct connection</h3>
            <p className="muted-copy">
              This adds or replaces the source state&apos;s direct <code>transition</code> field.
              Conditions and error branches remain editable in the Form view.
            </p>
          </div>
          <div className="graph-connection-fields">
            <label>
              <span>From state</span>
              <select
                aria-label="From state"
                value={sourceState}
                onChange={(event) => {
                  setConnectFrom(event.target.value);
                  setConnectionError(null);
                }}
              >
                {stateNames.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>To state</span>
              <select
                aria-label="To state"
                value={targetState}
                onChange={(event) => {
                  setConnectTo(event.target.value);
                  setConnectionError(null);
                }}
              >
                {stateNames.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <button className="button button-primary" type="button" onClick={connectStates}>
              Connect states
            </button>
          </div>
          {connectionError && (
            <p className="form-error" role="alert">
              {connectionError}
            </p>
          )}
        </section>
      )}
      {!graph.supported && graph.nodes.length === 0 ? (
        <div className="graph-empty" role="status">
          <strong>Graph unavailable for this document</strong>
          <p>{graph.warnings[0] ?? 'The source remains available in Source view.'}</p>
        </div>
      ) : textMode ? (
        <TextGraph
          graph={graph}
          selection={selection}
          onSelect={(next) => {
            setSelection(next);
            if (next.kind === 'edge') setSelectedNodeIds([]);
          }}
          onSelectNode={selectNode}
          onSourceLine={onSourceLine}
          onOpenForm={onOpenForm}
        />
      ) : (
        <div className="graph-layout">
          <div className="graph-canvas-wrap">
            <svg
              className="graph-canvas"
              role="application"
              aria-label="Interactive workflow graph. Use arrow keys to move focus and drag to pan."
              tabIndex={0}
              viewBox={`0 0 ${dimensions.width} ${dimensions.height}`}
              onKeyDown={onCanvasKeyDown}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              onWheel={onWheel}
            >
              <defs>
                <marker
                  id="graph-arrow"
                  markerWidth="9"
                  markerHeight="9"
                  refX="8"
                  refY="4.5"
                  orient="auto"
                >
                  <path d="M0,0 L9,4.5 L0,9 z" className="graph-arrow" />
                </marker>
              </defs>
              <g transform={`translate(${pan.x} ${pan.y}) scale(${zoom})`}>
                {displayGraph.edges.map((edge) => (
                  <GraphEdgeView
                    edge={edge}
                    from={findNode(displayGraph, edge.from)}
                    to={findNode(displayGraph, edge.to)}
                    selected={selection?.kind === 'edge' && selection.id === edge.id}
                    onSelect={() => {
                      setSelection({ kind: 'edge', id: edge.id });
                      setSelectedNodeIds([]);
                    }}
                    key={edge.id}
                  />
                ))}
                {displayGraph.nodes.map((node) => (
                  <GraphNodeView
                    node={node}
                    selected={selectedNodeIds.includes(node.id)}
                    onSelect={(multi) => selectNode(node, multi)}
                    onPointerDown={onNodePointerDown}
                    onPointerMove={onNodePointerMove}
                    onPointerUp={onNodePointerUp}
                    onNudge={nudgeNode}
                    key={node.id}
                  />
                ))}
              </g>
            </svg>
            {showMinimap && (
              <MiniMap graph={displayGraph} selection={selection} onSelect={setSelection} />
            )}
            <p className="graph-hint">Drag to pan · scroll to zoom · arrow keys move focus</p>
          </div>
          <GraphSelection
            graph={displayGraph}
            node={selectedNode}
            edge={selectedEdge}
            onSourceLine={onSourceLine}
            onOpenForm={onOpenForm}
          />
        </div>
      )}
    </section>
  );
}

function GraphNodeView({
  node,
  selected,
  onSelect,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onNudge,
}: {
  node: GraphNode;
  selected: boolean;
  onSelect: (multi?: boolean) => void;
  onPointerDown: (event: PointerEvent<SVGGElement>, node: GraphNode) => void;
  onPointerMove: (event: PointerEvent<SVGGElement>) => void;
  onPointerUp: (event: PointerEvent<SVGGElement>) => void;
  onNudge: (node: GraphNode, dx: number, dy: number) => void;
}): ReactNode {
  const typeClass = node.kind === 'state' ? nodeTypeClass(node.stateType) : node.kind;
  return (
    <g
      className={`graph-node graph-node-${typeClass} ${selected ? 'is-selected' : ''} ${node.reachable ? '' : 'is-unreachable'}`}
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      aria-label={`${node.label}${node.stateType ? `, ${node.stateType} state` : ''}`}
      transform={`translate(${node.x} ${node.y})`}
      onPointerDown={(event) => onPointerDown(event, node)}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onClick={(event) => onSelect(event.shiftKey)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect();
        }
        if (event.key === 'ArrowRight') {
          event.preventDefault();
          event.stopPropagation();
          onNudge(node, 24, 0);
        }
        if (event.key === 'ArrowLeft') {
          event.preventDefault();
          event.stopPropagation();
          onNudge(node, -24, 0);
        }
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          event.stopPropagation();
          onNudge(node, 0, 24);
        }
        if (event.key === 'ArrowUp') {
          event.preventDefault();
          event.stopPropagation();
          onNudge(node, 0, -24);
        }
      }}
    >
      <rect className="graph-node-surface" width={node.width} height={node.height} rx="14" />
      <rect className="graph-node-accent" width="6" height={node.height} rx="3" />
      <text className="graph-node-type" x="20" y="25">
        {node.stateType ?? node.kind}
      </text>
      <text className="graph-node-label" x="20" y="50">
        {shorten(node.label, 27)}
      </text>
      {node.kind === 'state' && node.details.terminal && (
        <text className="graph-node-terminal" x="20" y="75">
          terminal
        </text>
      )}
      {node.kind === 'state' && node.details.eventRef && (
        <text className="graph-node-event" x="20" y="75">
          waits for {shorten(node.details.eventRef, 18)}
        </text>
      )}
      {node.sourceLine && (
        <text className="graph-node-line" x={node.width - 18} y={node.height - 14} textAnchor="end">
          L{node.sourceLine}
        </text>
      )}
    </g>
  );
}

function GraphEdgeView({
  edge,
  from,
  to,
  selected,
  onSelect,
}: {
  edge: GraphEdge;
  from: GraphNode | null;
  to: GraphNode | null;
  selected: boolean;
  onSelect: () => void;
}): ReactNode {
  if (!from || !to) return null;
  const path = edgePath(from, to);
  const midpoint = edgeMidpoint(from, to);
  return (
    <g
      className={`graph-edge graph-edge-${edge.kind} ${selected ? 'is-selected' : ''}`}
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      aria-label={`${edge.label} transition from ${from.label} to ${to.label}`}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect();
        }
      }}
    >
      <path className="graph-edge-hit" d={path} />
      <path className="graph-edge-line" d={path} markerEnd="url(#graph-arrow)" />
      <rect
        className="graph-edge-label-bg"
        x={midpoint.x - Math.min(90, edge.label.length * 3.1)}
        y={midpoint.y - 12}
        width={Math.min(180, Math.max(46, edge.label.length * 6.2))}
        height="24"
        rx="8"
      />
      <text className="graph-edge-label" x={midpoint.x} y={midpoint.y + 4} textAnchor="middle">
        {shorten(edge.label, 28)}
      </text>
    </g>
  );
}

function GraphSelection({
  graph,
  node,
  edge,
  onSourceLine,
  onOpenForm,
}: {
  graph: WorkflowGraph;
  node: GraphNode | null;
  edge: GraphEdge | null;
  onSourceLine: (line: number) => void;
  onOpenForm: (stateName: string) => void;
}): ReactNode {
  if (node) {
    const outgoing = graph.edges.filter((item) => item.from === node.id);
    return (
      <aside className="graph-selection" aria-labelledby="graph-selection-title">
        <p className="eyebrow">Selected graph element</p>
        <h3 id="graph-selection-title">{node.label}</h3>
        <span className={`badge badge-graph-${nodeTypeClass(node.stateType)}`}>
          {node.stateType ?? node.kind}
        </span>
        <dl className="graph-selection-fields">
          <div>
            <dt>Reachability</dt>
            <dd>{node.reachable ? 'Reachable from start' : 'Unreachable'}</dd>
          </div>
          <div>
            <dt>Outgoing relationships</dt>
            <dd>{outgoing.length}</dd>
          </div>
          {node.details.eventRef && (
            <div>
              <dt>Event wait</dt>
              <dd>{node.details.eventRef}</dd>
            </div>
          )}
          {node.details.terminal && (
            <div>
              <dt>Outcome</dt>
              <dd>Terminal</dd>
            </div>
          )}
        </dl>
        {node.sourceLine && (
          <p className="graph-source-range">
            Source range: lines {node.sourceLine}
            {node.sourceEndLine && node.sourceEndLine > node.sourceLine
              ? `–${node.sourceEndLine}`
              : ''}
          </p>
        )}
        {node.sourceLine && <SourceButton line={node.sourceLine} onSourceLine={onSourceLine} />}
        {node.kind === 'state' && (
          <button
            className="button button-secondary graph-edit-form-button"
            type="button"
            onClick={() => onOpenForm(node.label)}
          >
            Edit state in Form
          </button>
        )}
        {node.details.actions.length > 0 && (
          <CollapsibleDetailList
            title="Actions"
            values={node.details.actions}
            defaultOpen={node.details.actions.length <= 2}
          />
        )}
        {node.details.conditions.length > 0 && (
          <CollapsibleDetailList
            title="Conditions"
            values={node.details.conditions.map((item) => `${item.label} → ${item.transition}`)}
          />
        )}
        {node.details.errors.length > 0 && (
          <CollapsibleDetailList
            title="Error branches"
            values={node.details.errors.map((item) => `${item.errorRef} → ${item.transition}`)}
          />
        )}
        {node.details.defaultTransition && (
          <CollapsibleDetailList title="Default branch" values={[node.details.defaultTransition]} />
        )}
      </aside>
    );
  }
  if (edge) {
    return (
      <aside className="graph-selection" aria-labelledby="graph-selection-title">
        <p className="eyebrow">Selected relationship</p>
        <h3 id="graph-selection-title">{edge.label}</h3>
        <span className={`badge badge-graph-${edge.kind}`}>{edge.kind}</span>
        <dl className="graph-selection-fields">
          <div>
            <dt>From</dt>
            <dd>{findNode(graph, edge.from)?.label ?? edge.from}</dd>
          </div>
          <div>
            <dt>To</dt>
            <dd>{findNode(graph, edge.to)?.label ?? edge.to}</dd>
          </div>
          {edge.condition && (
            <div>
              <dt>Condition</dt>
              <dd>
                <code>{edge.condition}</code>
              </dd>
            </div>
          )}
        </dl>
        {edge.sourceLine && (
          <p className="graph-source-range">Source range: line {edge.sourceLine}</p>
        )}
        {edge.sourceLine && <SourceButton line={edge.sourceLine} onSourceLine={onSourceLine} />}
        {edge.from.startsWith('state:') && (
          <button
            className="button button-secondary graph-edit-form-button"
            type="button"
            onClick={() => onOpenForm(edge.from.slice('state:'.length))}
          >
            Edit transition in Form
          </button>
        )}
      </aside>
    );
  }
  return (
    <aside className="graph-selection">
      <p className="muted-copy">Select a node or relationship to inspect its details.</p>
    </aside>
  );
}

function TextGraph({
  graph,
  selection,
  onSelect,
  onSelectNode,
  onSourceLine,
  onOpenForm,
}: {
  graph: WorkflowGraph;
  selection: Selection | null;
  onSelect: (selection: Selection) => void;
  onSelectNode: (node: GraphNode) => void;
  onSourceLine: (line: number) => void;
  onOpenForm: (stateName: string) => void;
}): ReactNode {
  const selectedEdge =
    selection?.kind === 'edge'
      ? (graph.edges.find((edge) => edge.id === selection.id) ?? null)
      : null;
  return (
    <div className="text-graph" aria-label="Textual workflow graph">
      <div className="text-graph-intro">
        <strong>Accessible graph outline</strong>
        <span>
          Select a state to enable shared deletion and Form actions; relationships include branch
          semantics and source lines.
        </span>
      </div>
      <table>
        <caption className="sr-only">Workflow graph nodes and outgoing relationships</caption>
        <thead>
          <tr>
            <th scope="col">Node</th>
            <th scope="col">Type</th>
            <th scope="col">Relationships</th>
            <th scope="col">Form</th>
            <th scope="col">Source</th>
          </tr>
        </thead>
        <tbody>
          {graph.nodes.map((node) => {
            const outgoing = graph.edges.filter((edge) => edge.from === node.id);
            return (
              <tr className={selection?.id === node.id ? 'is-selected' : ''} key={node.id}>
                <th scope="row">
                  <button
                    className="text-graph-node"
                    type="button"
                    onClick={() => onSelectNode(node)}
                  >
                    {node.label}
                  </button>
                </th>
                <td>
                  <span className={`token token-${nodeTypeClass(node.stateType)}`}>
                    {node.stateType ?? node.kind}
                  </span>
                </td>
                <td>
                  {outgoing.length === 0 ? (
                    <span className="muted-copy">None</span>
                  ) : outgoing.length > 3 ? (
                    <details className="text-graph-group">
                      <summary>{outgoing.length} relationships</summary>
                      <RelationshipList graph={graph} outgoing={outgoing} onSelect={onSelect} />
                    </details>
                  ) : (
                    <RelationshipList graph={graph} outgoing={outgoing} onSelect={onSelect} />
                  )}
                </td>
                <td>
                  {node.kind === 'state' ? (
                    <button
                      className="text-graph-action"
                      type="button"
                      onClick={() => onOpenForm(node.label)}
                    >
                      Edit {node.label} in Form
                    </button>
                  ) : (
                    '—'
                  )}
                </td>
                <td>
                  {node.sourceLine ? (
                    <SourceButton line={node.sourceLine} onSourceLine={onSourceLine} />
                  ) : (
                    '—'
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {selectedEdge?.from.startsWith('state:') && (
        <button
          className="button button-secondary graph-edit-form-button"
          type="button"
          onClick={() => onOpenForm(selectedEdge.from.slice('state:'.length))}
        >
          Edit selected transition in Form
        </button>
      )}
    </div>
  );
}

function MiniMap({
  graph,
  selection,
  onSelect,
}: {
  graph: WorkflowGraph;
  selection: Selection | null;
  onSelect: (selection: Selection) => void;
}): ReactNode {
  const dimensions = graphDimensions(graph);
  return (
    <div className="graph-minimap" aria-label="Workflow graph minimap">
      <p className="eyebrow">Minimap</p>
      <svg
        viewBox={`0 0 ${dimensions.width} ${dimensions.height}`}
        role="img"
        aria-label="Workflow graph overview"
      >
        {graph.edges.map((edge) => {
          const from = findNode(graph, edge.from);
          const to = findNode(graph, edge.to);
          return from && to ? (
            <path className="minimap-edge" d={edgePath(from, to)} key={edge.id} />
          ) : null;
        })}
        {graph.nodes.map((node) => (
          <rect
            className={`minimap-node ${selection?.id === node.id ? 'is-selected' : ''}`}
            x={node.x}
            y={node.y}
            width={node.width}
            height={node.height}
            rx="5"
            onClick={() => onSelect({ kind: 'node', id: node.id })}
            key={node.id}
          />
        ))}
      </svg>
    </div>
  );
}

function SourceButton({
  line,
  onSourceLine,
}: {
  line: number;
  onSourceLine: (line: number) => void;
}): ReactNode {
  return (
    <button
      className="source-link graph-source-link"
      type="button"
      onClick={() => onSourceLine(line)}
    >
      Open source line {line}
    </button>
  );
}

function CollapsibleDetailList({
  title,
  values,
  defaultOpen = false,
}: {
  title: string;
  values: string[];
  defaultOpen?: boolean;
}): ReactNode {
  return (
    <details className="graph-detail-list" open={defaultOpen}>
      <summary>
        {title} ({values.length})
      </summary>
      <ul>
        {values.map((value) => (
          <li key={value}>{value}</li>
        ))}
      </ul>
    </details>
  );
}

function RelationshipList({
  graph,
  outgoing,
  onSelect,
}: {
  graph: WorkflowGraph;
  outgoing: GraphEdge[];
  onSelect: (selection: Selection) => void;
}): ReactNode {
  return (
    <ul className="text-graph-edges">
      {outgoing.map((edge) => (
        <li key={edge.id}>
          <button type="button" onClick={() => onSelect({ kind: 'edge', id: edge.id })}>
            {edge.label} → {findNode(graph, edge.to)?.label ?? edge.to}
          </button>
        </li>
      ))}
    </ul>
  );
}

function defaultSelection(graph: WorkflowGraph): Selection | null {
  return graph.nodes[0] ? { kind: 'node', id: graph.nodes[0].id } : null;
}
function findNode(graph: WorkflowGraph, id: string): GraphNode | null {
  return graph.nodes.find((node) => node.id === id) ?? null;
}
function graphDimensions(graph: WorkflowGraph): { width: number; height: number } {
  return {
    width: Math.max(720, ...graph.nodes.map((node) => node.x + node.width + 34)),
    height: Math.max(420, ...graph.nodes.map((node) => node.y + node.height + 34)),
  };
}
function edgePath(from: GraphNode, to: GraphNode): string {
  const startX = from.x + from.width;
  const startY = from.y + from.height / 2;
  const endX = to.x;
  const endY = to.y + to.height / 2;
  if (from.id === to.id) {
    return `M ${startX - 34} ${from.y + 18} C ${startX + 86} ${from.y - 34}, ${startX + 86} ${from.y + from.height + 34}, ${startX - 34} ${from.y + from.height - 18}`;
  }
  const bend = Math.max(50, Math.abs(endX - startX) / 2);
  return `M ${startX} ${startY} C ${startX + bend} ${startY}, ${endX - bend} ${endY}, ${endX} ${endY}`;
}
function edgeMidpoint(from: GraphNode, to: GraphNode): { x: number; y: number } {
  return {
    x: (from.x + from.width + to.x) / 2,
    y: (from.y + from.height / 2 + to.y + to.height / 2) / 2,
  };
}
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
function shorten(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}
