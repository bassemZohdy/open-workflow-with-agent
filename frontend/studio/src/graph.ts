import type { DocumentResponse } from './workspace';
import { parseStateSummaries } from './state-patch';

export type GraphNodeKind = 'start' | 'state' | 'end' | 'missing';
export type GraphEdgeKind =
  'start' | 'transition' | 'conditional' | 'default' | 'error' | 'terminal';

/** State types exposed by the local Serverless Workflow 0.8 authoring profile. */
export const workflow08StateTypes = [
  'inject',
  'operation',
  'switch',
  'callback',
  'event',
  'sleep',
  'foreach',
  'parallel',
] as const;

export type GraphNode = {
  id: string;
  kind: GraphNodeKind;
  label: string;
  stateType: string | null;
  sourceLine: number | null;
  sourceEndLine: number | null;
  reachable: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  details: GraphNodeDetails;
};

export type GraphNodeDetails = {
  conditions: Array<{ label: string; transition: string; sourceLine: number | null }>;
  defaultTransition: string | null;
  actions: string[];
  eventRef: string | null;
  errors: Array<{ errorRef: string; transition: string; sourceLine: number | null }>;
  terminal: boolean;
  fields: Record<string, unknown>;
};

export type GraphEdge = {
  id: string;
  from: string;
  to: string;
  label: string;
  kind: GraphEdgeKind;
  condition: string | null;
  sourceLine: number | null;
};

export type WorkflowGraph = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  startState: string | null;
  warnings: string[];
  supported: boolean;
};

const NODE_WIDTH = 218;
const NODE_HEIGHT = 98;
const HORIZONTAL_GAP = 92;
const VERTICAL_GAP = 34;

export function buildWorkflowGraph(
  document: DocumentResponse,
  source = document.content,
): WorkflowGraph {
  if (document.kind !== 'workflow') {
    return {
      nodes: [],
      edges: [],
      startState: null,
      warnings: ['Catalog documents do not have a workflow state graph.'],
      supported: false,
    };
  }

  const canonicalRoot = asRecord(document.sourceTree);
  const draftRoot = parseDraftRoot(source, document.format);
  const canonicalStateValues = asArray(canonicalRoot?.states)
    .map(asRecord)
    .filter(Boolean) as Record<string, unknown>[];
  const stateValues = projectDraftStates(source, document.format, draftRoot, canonicalStateValues);
  const lines = source.split(/\r?\n/);
  const startState = draftRoot
    ? asString(draftRoot.start)
    : document.format === 'yaml'
      ? readYamlTopLevelScalar(source, 'start')
      : asString(canonicalRoot?.start);
  const names = new Set(
    stateValues
      .map((state) => asString(state.name))
      .filter((name): name is string => Boolean(name)),
  );
  const nodes = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];
  const warnings: string[] = [];
  const stateRanges = new Map<string, { start: number; end: number }>();
  const directTransitions = new Map(
    parseStateSummaries(source, document.format).map((state) => [state.name, state.transition]),
  );

  nodes.set('start', createNode('start', 'start', 'Start', null, null, null, true, emptyDetails()));
  if (startState) {
    if (!names.has(startState)) {
      nodes.set(
        stateId(startState),
        createNode(
          stateId(startState),
          'missing',
          startState,
          'unknown',
          findFieldLine(lines, 0, lines.length, 'start', startState),
          null,
          false,
          emptyDetails(),
        ),
      );
      warnings.push(`Workflow start targets missing state “${startState}”.`);
    }
    edges.push({
      id: 'edge:start',
      from: 'start',
      to: stateId(startState),
      label: 'start',
      kind: 'start',
      condition: null,
      sourceLine: findFieldLine(lines, 0, lines.length, 'start', startState),
    });
  } else {
    warnings.push('The workflow does not declare a start state.');
  }

  stateValues.forEach((state, index) => {
    const name = asString(state.name) ?? `Unnamed state ${index + 1}`;
    const type = asString(state.type) ?? 'unknown';
    const range = findStateRange(lines, name, stateRanges);
    stateRanges.set(name, range);
    nodes.set(
      stateId(name),
      createNode(
        stateId(name),
        'state',
        name,
        type,
        range.start,
        range.end,
        false,
        stateDetails(state, lines, range),
      ),
    );
  });

  stateValues.forEach((state, index) => {
    const name = asString(state.name) ?? `Unnamed state ${index + 1}`;
    const range = stateRanges.get(name) ?? { start: null, end: null };
    const transitions = extractTransitions(
      directTransitions.has(name)
        ? { ...state, transition: directTransitions.get(name) ?? undefined }
        : state,
      lines,
      range,
    );
    transitions.forEach((transition, transitionIndex) => {
      const targetId = transition.to === 'End' ? 'end' : stateId(transition.to);
      if (transition.to !== 'End' && !names.has(transition.to)) {
        if (!nodes.has(targetId)) {
          nodes.set(
            targetId,
            createNode(
              targetId,
              'missing',
              transition.to,
              'unknown',
              transition.sourceLine,
              transition.sourceLine,
              false,
              emptyDetails(),
            ),
          );
        }
        warnings.push(`Transition from ${name} targets missing state “${transition.to}”.`);
      }
      edges.push({
        id: `edge:${name}:${transition.kind}:${transitionIndex}:${transition.to}`,
        from: stateId(name),
        to: targetId,
        label: transition.label,
        kind: transition.kind,
        condition: transition.condition,
        sourceLine: transition.sourceLine,
      });
    });
  });

  if (edges.some((edge) => edge.to === 'end')) {
    nodes.set(
      'end',
      createNode('end', 'end', 'End', null, findFirstEndLine(lines), null, false, emptyDetails()),
    );
  }

  const reachable = reachableNodes(edges);
  nodes.forEach((node, id) => {
    node.reachable = reachable.has(id) || node.kind === 'start';
    if (node.kind === 'state' && !node.reachable) {
      warnings.push(`State “${node.label}” is unreachable from the workflow start.`);
    }
    if (node.kind === 'state' && !edges.some((edge) => edge.from === id || edge.to === id)) {
      warnings.push(`State “${node.label}” is disconnected from every transition.`);
    }
  });

  const positioned = layoutNodes([...nodes.values()], edges);
  return {
    nodes: positioned,
    edges,
    startState,
    warnings: unique(warnings),
    supported: document.specVersion === '0.8',
  };
}

export function stateId(name: string): string {
  return `state:${name}`;
}

export function nodeTypeClass(type: string | null): string {
  if (!type) return 'generic';
  if (type === 'inject' || type === 'switch' || type === 'operation' || type === 'callback')
    return type;
  return 'generic';
}

function createNode(
  id: string,
  kind: GraphNodeKind,
  label: string,
  stateType: string | null,
  sourceLine: number | null,
  sourceEndLine: number | null,
  reachable: boolean,
  details: GraphNodeDetails,
): GraphNode {
  return {
    id,
    kind,
    label,
    stateType,
    sourceLine,
    sourceEndLine,
    reachable,
    x: 0,
    y: 0,
    width: NODE_WIDTH,
    height: NODE_HEIGHT,
    details,
  };
}

function emptyDetails(): GraphNodeDetails {
  return {
    conditions: [],
    defaultTransition: null,
    actions: [],
    eventRef: null,
    errors: [],
    terminal: false,
    fields: {},
  };
}

function stateDetails(
  state: Record<string, unknown>,
  lines: string[],
  range: { start: number; end: number },
): GraphNodeDetails {
  const details = emptyDetails();
  details.terminal = state.end === true;
  details.eventRef = asString(state.eventRef);
  const conditions = asArray(state.dataConditions);
  details.conditions = conditions
    .map(asRecord)
    .filter(Boolean)
    .map((condition) => {
      const transition = asString(condition?.transition);
      if (!transition) return null;
      const expression = asString(condition?.condition) ?? 'condition';
      return {
        label: expression,
        transition,
        sourceLine: findFieldLine(lines, range.start, range.end, 'transition', transition),
      };
    })
    .filter((item): item is GraphNodeDetails['conditions'][number] => Boolean(item));
  const defaultCondition = asRecord(state.defaultCondition);
  details.defaultTransition = asString(defaultCondition?.transition) ?? null;
  const actionValues = [
    ...asArray(state.actions),
    ...(state.action === undefined ? [] : [state.action]),
  ];
  details.actions = actionValues
    .map(asRecord)
    .filter(Boolean)
    .map((action) => {
      const actionName = asString(action?.name) ?? 'Unnamed action';
      const ref = asString(asRecord(action?.functionRef)?.refName);
      return ref ? `${actionName} · ${ref}` : actionName;
    });
  details.errors = asArray(state.onErrors)
    .map(asRecord)
    .filter(Boolean)
    .map((error) => {
      const transition = asString(error?.transition);
      if (!transition) return null;
      return {
        errorRef: asString(error?.errorRef) ?? 'error',
        transition,
        sourceLine: findFieldLine(lines, range.start, range.end, 'transition', transition),
      };
    })
    .filter((item): item is GraphNodeDetails['errors'][number] => Boolean(item));

  const known = new Set([
    'name',
    'type',
    'transition',
    'dataConditions',
    'defaultCondition',
    'actions',
    'action',
    'actionDataFilter',
    'eventRef',
    'eventDataFilter',
    'onErrors',
    'end',
  ]);
  Object.entries(state).forEach(([key, value]) => {
    if (!known.has(key)) details.fields[key] = value;
  });
  return details;
}

type ExtractedTransition = {
  to: string;
  label: string;
  kind: Exclude<GraphEdgeKind, 'start'>;
  condition: string | null;
  sourceLine: number | null;
};

function extractTransitions(
  state: Record<string, unknown>,
  lines: string[],
  range: { start: number | null; end: number | null },
): ExtractedTransition[] {
  const start = range.start ?? 0;
  const end = range.end ?? lines.length;
  const result: ExtractedTransition[] = [];
  const direct = asString(state.transition);
  if (direct) {
    result.push({
      to: direct,
      label: 'transition',
      kind: 'transition',
      condition: null,
      sourceLine: findFieldLine(lines, start, end, 'transition', direct),
    });
  }
  asArray(state.dataConditions)
    .map(asRecord)
    .filter(Boolean)
    .forEach((condition) => {
      const target = asString(condition?.transition);
      if (!target) return;
      const expression = asString(condition?.condition) ?? 'condition';
      result.push({
        to: target,
        label: `if ${compact(expression)}`,
        kind: 'conditional',
        condition: expression,
        sourceLine: findFieldLine(lines, start, end, 'transition', target),
      });
    });
  const defaultTarget = asString(asRecord(state.defaultCondition)?.transition);
  if (defaultTarget) {
    result.push({
      to: defaultTarget,
      label: 'default',
      kind: 'default',
      condition: null,
      sourceLine: findFieldLine(lines, start, end, 'transition', defaultTarget),
    });
  }
  asArray(state.onErrors)
    .map(asRecord)
    .filter(Boolean)
    .forEach((error) => {
      const target = asString(error?.transition);
      if (!target) return;
      const errorRef = asString(error?.errorRef) ?? 'error';
      result.push({
        to: target,
        label: `error ${errorRef}`,
        kind: 'error',
        condition: errorRef,
        sourceLine: findFieldLine(lines, start, end, 'transition', target),
      });
    });
  if (state.end === true) {
    result.push({
      to: 'End',
      label: 'end',
      kind: 'terminal',
      condition: null,
      sourceLine: findFieldLine(lines, start, end, 'end', 'true'),
    });
  }
  return result;
}

function layoutNodes(nodes: GraphNode[], edges: GraphEdge[]): GraphNode[] {
  const layer = new Map<string, number>([['start', 0]]);
  const queue = ['start'];
  while (queue.length > 0) {
    const current = queue.shift() as string;
    const nextLayer = (layer.get(current) ?? 0) + 1;
    edges
      .filter((edge) => edge.from === current)
      .forEach((edge) => {
        if (!layer.has(edge.to)) {
          layer.set(edge.to, nextLayer);
          queue.push(edge.to);
        }
      });
  }
  const maxLayer = Math.max(0, ...layer.values());
  nodes.forEach((node) => {
    if (!layer.has(node.id)) layer.set(node.id, maxLayer + 1);
  });
  const rows = new Map<number, GraphNode[]>();
  nodes.forEach((node) => {
    const bucket = rows.get(layer.get(node.id) ?? 0) ?? [];
    bucket.push(node);
    rows.set(layer.get(node.id) ?? 0, bucket);
  });
  rows.forEach((bucket, column) => {
    bucket.sort((left, right) => left.label.localeCompare(right.label));
    bucket.forEach((node, row) => {
      node.x = 34 + column * (NODE_WIDTH + HORIZONTAL_GAP);
      node.y = 34 + row * (NODE_HEIGHT + VERTICAL_GAP);
    });
  });
  return nodes;
}

function reachableNodes(edges: GraphEdge[]): Set<string> {
  const reachable = new Set<string>(['start']);
  const queue = ['start'];
  while (queue.length > 0) {
    const current = queue.shift() as string;
    edges
      .filter((edge) => edge.from === current)
      .forEach((edge) => {
        if (!reachable.has(edge.to)) {
          reachable.add(edge.to);
          queue.push(edge.to);
        }
      });
  }
  return reachable;
}

function findStateRange(
  lines: string[],
  name: string,
  ranges: Map<string, { start: number; end: number }>,
): { start: number; end: number } {
  const existing = ranges.get(name);
  if (existing) return existing;
  const start = lines.findIndex((line) => isNamedItem(line, name));
  if (start < 0) return { start: 0, end: lines.length };
  const indent = indentation(lines[start] ?? '');
  const end = lines.findIndex(
    (line, index) =>
      index > start &&
      line.trim() &&
      indentation(line) === indent &&
      /^-\s+name\s*:/.test(line.trim()),
  );
  return { start, end: end < 0 ? lines.length : end };
}

function isNamedItem(line: string, name: string): boolean {
  const match = line.match(/^\s*-\s+name\s*:\s*(.*)$/);
  return Boolean(match && scalar(match[1] ?? '') === name);
}

function findFieldLine(
  lines: string[],
  start: number,
  end: number,
  field: string,
  value: string,
): number | null {
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`^\\s*(?:-\\s*)?${field}\\s*:\\s*["']?${escaped}["']?(?:\\s|$)`);
  const found = lines.slice(start, end).findIndex((line) => pattern.test(line));
  if (found >= 0) return start + found + 1;
  const key = new RegExp(`^\\s*(?:-\\s*)?${field}\\s*:`);
  const keyFound = lines.slice(start, end).findIndex((line) => key.test(line));
  return keyFound >= 0 ? start + keyFound + 1 : null;
}

function findFirstEndLine(lines: string[]): number | null {
  const index = lines.findIndex((line) => /^\s*end\s*:\s*true\s*$/.test(line));
  return index >= 0 ? index + 1 : null;
}

function parseDraftRoot(
  source: string,
  format: DocumentResponse['format'],
): Record<string, unknown> | null {
  if (format !== 'json') return null;
  try {
    const value = JSON.parse(source) as unknown;
    return asRecord(value);
  } catch {
    return null;
  }
}

function projectDraftStates(
  source: string,
  format: DocumentResponse['format'],
  draftRoot: Record<string, unknown> | null,
  canonicalStates: Record<string, unknown>[],
): Record<string, unknown>[] {
  if (draftRoot && Array.isArray(draftRoot.states)) {
    return draftRoot.states.map(asRecord).filter(Boolean) as Record<string, unknown>[];
  }
  if (format !== 'yaml' || !/^states\s*:/m.test(source)) return canonicalStates;

  const canonicalByName = new Map(
    canonicalStates.flatMap((state) => {
      const name = asString(state.name);
      return name ? [[name, state] as const] : [];
    }),
  );
  return parseStateSummaries(source, format).map((summary) => {
    const projected = { ...(canonicalByName.get(summary.name) ?? {}) };
    projected.name = summary.name;
    projected.type = summary.type;
    if (summary.transition) projected.transition = summary.transition;
    else delete projected.transition;
    if (summary.end) projected.end = true;
    else delete projected.end;
    return projected;
  });
}

function readYamlTopLevelScalar(source: string, key: string): string | null {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = source.match(new RegExp(`^${escaped}\\s*:\\s*(.*?)\\s*(?:#.*)?$`, 'm'));
  if (!match?.[1]) return null;
  return scalar(match[1]);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}
function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}
function scalar(value: string): string {
  return value.trim().replace(/^['"]|['"]$/g, '');
}
function indentation(line: string): number {
  return line.match(/^\s*/)?.[0].length ?? 0;
}
function compact(value: string): string {
  const singleLine = value.replace(/\s+/g, ' ').trim();
  return singleLine.length > 80 ? `${singleLine.slice(0, 77)}…` : singleLine;
}
function unique(values: string[]): string[] {
  return [...new Set(values)];
}
