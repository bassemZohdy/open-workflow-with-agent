import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { formatBytes, formatModifiedAt, type DocumentResponse, type NamedItem } from './workspace';

type SourceViewerProps = {
  document: DocumentResponse;
  selectedLine: number | null;
  onSelectLine: (line: number) => void;
};

export function SourceViewer({
  document,
  selectedLine,
  onSelectLine,
}: SourceViewerProps): ReactNode {
  const lines = useMemo(() => document.content.split(/\r?\n/), [document.content]);
  const [query, setQuery] = useState('');
  const [matchIndex, setMatchIndex] = useState(0);
  const [collapsed, setCollapsed] = useState<Set<number>>(() => new Set());
  const lineRefs = useRef(new Map<number, HTMLDivElement>());
  const matchingLines = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return [];
    return lines.flatMap((line, index) => (line.toLowerCase().includes(needle) ? [index + 1] : []));
  }, [lines, query]);
  const focusLine = selectedLine ?? matchingLines[matchIndex] ?? null;
  const foldStarts = useMemo(
    () =>
      lines.flatMap((line, index) => {
        const indent = indentation(line);
        const next = lines[index + 1];
        return next && isFoldable(line, document.format) && indentation(next) > indent
          ? [index + 1]
          : [];
      }),
    [document.format, lines],
  );
  const hiddenLines = useMemo(
    () => hiddenLineSet(lines, collapsed, foldStarts),
    [collapsed, foldStarts, lines],
  );

  useEffect(() => {
    if (focusLine) lineRefs.current.get(focusLine)?.scrollIntoView({ block: 'center' });
  }, [focusLine]);

  const copySource = async () => {
    try {
      await navigator.clipboard.writeText(document.content);
    } catch {
      // The source remains selectable when clipboard permission is unavailable.
    }
  };

  const moveMatch = (direction: 1 | -1) => {
    if (matchingLines.length === 0) return;
    setMatchIndex((current) => (current + direction + matchingLines.length) % matchingLines.length);
    onSelectLine(
      matchingLines[(matchIndex + direction + matchingLines.length) % matchingLines.length] ?? 1,
    );
  };

  return (
    <section className="source-view" aria-labelledby="source-title">
      <div className="source-toolbar">
        <div>
          <p className="eyebrow">Canonical source · {document.format.toUpperCase()}</p>
          <h2 id="source-title">{document.path}</h2>
        </div>
        <div className="source-actions">
          <label className="source-search">
            <span className="sr-only">Search source</span>
            <span aria-hidden="true">⌕</span>
            <input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setMatchIndex(0);
              }}
              placeholder="Find in source"
            />
          </label>
          <span className="source-match-count" aria-live="polite">
            {matchingLines.length > 0 ? `${matchIndex + 1}/${matchingLines.length}` : 'No matches'}
          </span>
          <button
            className="icon-button"
            type="button"
            aria-label="Previous source match"
            onClick={() => moveMatch(-1)}
            disabled={matchingLines.length === 0}
          >
            ↑
          </button>
          <button
            className="icon-button"
            type="button"
            aria-label="Next source match"
            onClick={() => moveMatch(1)}
            disabled={matchingLines.length === 0}
          >
            ↓
          </button>
          <button
            className="button button-secondary"
            type="button"
            onClick={() => void copySource()}
          >
            Copy source
          </button>
        </div>
      </div>
      <div className="source-status" role="status">
        {lines.length} lines · {formatBytes(document.sizeBytes)} · revision{' '}
        {document.revisionNumber}
      </div>
      <div
        className="source-code"
        role="region"
        aria-label="Syntax-highlighted source"
        tabIndex={0}
      >
        {lines.map((line, index) => {
          const lineNumber = index + 1;
          if (hiddenLines.has(lineNumber)) return null;
          const foldable = foldStarts.includes(lineNumber);
          const isCollapsed = collapsed.has(lineNumber);
          const isMatch = matchingLines.includes(lineNumber);
          return (
            <div
              className={`source-line ${focusLine === lineNumber ? 'is-focused' : ''} ${isMatch ? 'is-match' : ''}`}
              key={lineNumber}
              ref={(element) => {
                if (element) lineRefs.current.set(lineNumber, element);
                else lineRefs.current.delete(lineNumber);
              }}
            >
              <button
                className="line-number"
                type="button"
                onClick={() => onSelectLine(lineNumber)}
                aria-label={`Go to source line ${lineNumber}`}
                aria-current={focusLine === lineNumber ? 'location' : undefined}
              >
                {lineNumber}
              </button>
              {foldable ? (
                <button
                  className="fold-button"
                  type="button"
                  onClick={() => setCollapsed((current) => toggleSet(current, lineNumber))}
                  aria-label={`${isCollapsed ? 'Expand' : 'Collapse'} source line ${lineNumber}`}
                >
                  {isCollapsed ? '▸' : '▾'}
                </button>
              ) : (
                <span className="fold-placeholder" aria-hidden="true" />
              )}
              <code>{highlightLine(line)}</code>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function MetadataView({
  document,
  onSourceLine,
}: {
  document: DocumentResponse;
  onSourceLine: (line: number) => void;
}): ReactNode {
  const metadata = document.metadata;
  const knownFields = new Set([
    'id',
    'name',
    'description',
    'version',
    'specVersion',
    'openapi',
    'start',
    'timeouts',
    'constants',
    'annotations',
    'extensions',
    'functions',
    'events',
    'errors',
    'states',
    'subFlowRef',
    'subflowRef',
  ]);
  const unknownFields = Object.entries(document.sourceTree ?? {}).filter(
    ([key]) => !knownFields.has(key),
  );
  if (!metadata)
    return (
      <section className="metadata-view" aria-labelledby="metadata-title">
        <p className="eyebrow">Metadata unavailable</p>
        <h2 id="metadata-title">Source-only document</h2>
        <p>
          This document could not be projected safely. Its source and diagnostics remain available
          without mutation.
        </p>
        <GenericDetails title="Parsed source" value={document.sourceTree} />
      </section>
    );
  return (
    <section className="metadata-view" aria-labelledby="metadata-title">
      <div className="metadata-heading">
        <div>
          <p className="eyebrow">Projection · read-only</p>
          <h2 id="metadata-title">{metadata.name ?? document.displayName}</h2>
          <p>{metadata.description ?? 'No description provided.'}</p>
        </div>
        <span className={`badge badge-${document.validationState}`}>
          {document.validationState === 'valid' ? 'Parsed' : document.validationState}
        </span>
      </div>
      {(document.reusableSubflow === true || document.path.includes('/sub_flows/')) && (
        <div className="metadata-section">
          <div className="subflow-contract">
            <h3>Subflow contract</h3>
            <p className="muted-copy">
              This document is identified as a reusable subflow. Inputs and outputs are shown
              generically when the source declares them; the Graph tab exposes its state graph.
            </p>
            <div className="generic-grid">
              <GenericDetails
                title="Inputs"
                value={document.sourceTree?.inputs ?? document.sourceTree?.input ?? null}
                sourceKey="inputs"
                content={document.content}
                onSourceLine={onSourceLine}
              />
              <GenericDetails
                title="Outputs"
                value={document.sourceTree?.outputs ?? document.sourceTree?.output ?? null}
                sourceKey="outputs"
                content={document.content}
                onSourceLine={onSourceLine}
              />
              <GenericDetails
                title="Errors"
                value={document.sourceTree?.errors ?? null}
                sourceKey="errors"
                content={document.content}
                onSourceLine={onSourceLine}
              />
              <GenericDetails
                title="Timeouts"
                value={document.sourceTree?.timeouts ?? null}
                sourceKey="timeouts"
                content={document.content}
                onSourceLine={onSourceLine}
              />
            </div>
          </div>
        </div>
      )}
      <div className="metadata-section">
        <h3>Identity and compatibility</h3>
        <div className="metadata-fields">
          <MetadataField
            label="Workflow ID"
            value={metadata.workflowId}
            sourceKey="id"
            content={document.content}
            onSourceLine={onSourceLine}
          />
          <MetadataField
            label="Name"
            value={metadata.name}
            sourceKey={document.kind === 'catalog' ? 'title' : 'name'}
            content={document.content}
            onSourceLine={onSourceLine}
          />
          <MetadataField
            label="Version"
            value={metadata.version}
            sourceKey={document.kind === 'catalog' ? 'version' : 'version'}
            content={document.content}
            onSourceLine={onSourceLine}
          />
          <MetadataField
            label="Specification"
            value={metadata.specVersion ?? metadata.openapi}
            sourceKey={metadata.specVersion ? 'specVersion' : 'openapi'}
            content={document.content}
            onSourceLine={onSourceLine}
          />
          <MetadataField
            label="Start state"
            value={metadata.start}
            sourceKey="start"
            content={document.content}
            onSourceLine={onSourceLine}
          />
          <MetadataField
            label="Modified"
            value={formatModifiedAt(document.modifiedAt)}
            sourceKey={null}
            content={document.content}
            onSourceLine={onSourceLine}
          />
        </div>
      </div>
      <div className="metadata-section">
        <h3>Workflow structure</h3>
        <div className="metric-grid">
          <Metric label="States" value={sumValues(metadata.stateCounts)} />
          <Metric label="Terminal states" value={metadata.terminalStates.length} />
          <Metric label="Functions" value={metadata.functions.length} />
          <Metric label="Catalogs" value={document.catalogAliases.length} />
          <Metric label="Events" value={metadata.events.length} />
          <Metric label="Errors" value={metadata.errors.length} />
          <Metric label="Subflow references" value={metadata.subflowReferences.length} />
        </div>
        <div className="metadata-columns">
          <NamedItems
            title="Functions and catalog operations"
            items={metadata.functions}
            sourceKey="functions"
            content={document.content}
            onSourceLine={onSourceLine}
          />
          <NamedItems
            title="Catalogs"
            items={document.catalogAliases.map((name) => ({ name, detail: 'catalog alias' }))}
            sourceKey="definitions"
            content={document.content}
            onSourceLine={onSourceLine}
          />
          <NamedItems
            title="Events"
            items={metadata.events}
            sourceKey="events"
            content={document.content}
            onSourceLine={onSourceLine}
          />
          <NamedItems
            title="Errors"
            items={metadata.errors}
            sourceKey="errors"
            content={document.content}
            onSourceLine={onSourceLine}
          />
          <NamedItems
            title="Terminal states"
            items={metadata.terminalStates.map((name) => ({ name, detail: 'end: true' }))}
            sourceKey="states"
            content={document.content}
            onSourceLine={onSourceLine}
          />
        </div>
      </div>
      <div className="metadata-section">
        <h3>Source fields</h3>
        <div className="generic-grid">
          <GenericDetails
            title="Timeouts"
            value={metadata.timeouts}
            sourceKey="timeouts"
            content={document.content}
            onSourceLine={onSourceLine}
          />
          <GenericDetails
            title="Constants"
            value={metadata.constants}
            sourceKey="constants"
            content={document.content}
            onSourceLine={onSourceLine}
          />
          <GenericDetails
            title="Annotations"
            value={metadata.annotations}
            sourceKey="annotations"
            content={document.content}
            onSourceLine={onSourceLine}
          />
          <GenericDetails
            title="Extensions"
            value={metadata.extensions}
            sourceKey="extensions"
            content={document.content}
            onSourceLine={onSourceLine}
          />
        </div>
      </div>
      {unknownFields.length > 0 && (
        <div className="metadata-section">
          <h3>Unsupported or extension fields</h3>
          <p className="muted-copy">
            These fields are retained as generic source data and are not silently discarded.
          </p>
          <div className="generic-grid">
            {unknownFields.map(([key, value]) => (
              <GenericDetails
                key={key}
                title={key}
                value={value}
                sourceKey={key}
                content={document.content}
                onSourceLine={onSourceLine}
              />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function MetadataField({
  label,
  value,
  sourceKey,
  content,
  onSourceLine,
}: {
  label: string;
  value: string | null;
  sourceKey: string | null;
  content: string;
  onSourceLine: (line: number) => void;
}): ReactNode {
  return (
    <div className="metadata-field">
      <dt>
        {label}
        {sourceKey && (
          <SourceLink sourceKey={sourceKey} content={content} onSourceLine={onSourceLine} />
        )}
      </dt>
      <dd>{value ?? '—'}</dd>
    </div>
  );
}
function Metric({ label, value }: { label: string; value: number }): ReactNode {
  return (
    <div className="metric">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}
function NamedItems({
  title,
  items,
  sourceKey,
  content,
  onSourceLine,
}: {
  title: string;
  items: NamedItem[];
  sourceKey: string;
  content: string;
  onSourceLine: (line: number) => void;
}): ReactNode {
  return (
    <div className="named-items">
      <h4>
        {title} <SourceLink sourceKey={sourceKey} content={content} onSourceLine={onSourceLine} />
      </h4>
      {items.length === 0 ? (
        <p className="muted-copy">None detected.</p>
      ) : (
        <ul>
          {items.map((item) => (
            <li key={`${item.name}-${item.detail}`}>
              <strong>{item.name}</strong>
              {item.detail && <small>{item.detail}</small>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
function SourceLink({
  sourceKey,
  content,
  onSourceLine,
}: {
  sourceKey: string;
  content: string;
  onSourceLine: (line: number) => void;
}): ReactNode {
  const line = findSourceLine(content, sourceKey);
  return line ? (
    <button
      className="source-link"
      type="button"
      onClick={() => onSourceLine(line)}
      aria-label={`Open ${sourceKey} at source line ${line}`}
    >
      line {line}
    </button>
  ) : null;
}
export function GenericDetails({
  title,
  value,
  sourceKey,
  content,
  onSourceLine,
}: {
  title: string;
  value: unknown;
  sourceKey?: string;
  content?: string;
  onSourceLine?: (line: number) => void;
}): ReactNode {
  const line = sourceKey && content && onSourceLine ? findSourceLine(content, sourceKey) : null;
  return (
    <details className="generic-details" open={value !== null && value !== undefined}>
      <summary>
        {title}
        {line && content && onSourceLine ? (
          <button
            className="source-link"
            type="button"
            onClick={(event) => {
              event.preventDefault();
              onSourceLine(line);
            }}
          >
            line {line}
          </button>
        ) : null}
      </summary>
      <div className="generic-value">
        <Value value={value} />
      </div>
    </details>
  );
}
function Value({ value }: { value: unknown }): ReactNode {
  if (value === null || value === undefined) return <span className="muted-copy">None</span>;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')
    return <code>{String(value)}</code>;
  if (Array.isArray(value))
    return value.length === 0 ? (
      <span className="muted-copy">Empty</span>
    ) : (
      <ul>
        {value.map((item, index) => (
          <li key={index}>
            <Value value={item} />
          </li>
        ))}
      </ul>
    );
  if (typeof value === 'object')
    return (
      <dl className="generic-object">
        {Object.entries(value as Record<string, unknown>).map(([key, child]) => (
          <div key={key}>
            <dt>{key}</dt>
            <dd>
              <Value value={child} />
            </dd>
          </div>
        ))}
      </dl>
    );
  return <code>Unsupported value</code>;
}

function findSourceLine(content: string, sourceKey: string): number | null {
  const escaped = sourceKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`^\\s*(?:-\\s*)?(?:["']?${escaped}["']?)\\s*:`, 'm');
  const match = regex.exec(content);
  return match ? content.slice(0, match.index).split(/\r?\n/).length : null;
}
function sumValues(values: Record<string, number>): number {
  return Object.values(values).reduce((sum, value) => sum + value, 0);
}
function indentation(line: string): number {
  return line.match(/^\s*/)?.[0].length ?? 0;
}
function isFoldable(line: string, format: DocumentResponse['format']): boolean {
  return format === 'json'
    ? /[\[{]\s*,?$/.test(line.trim())
    : /^\s*(?:-\s*)?[^#\s][^:]*:\s*(?:#.*)?$/.test(line);
}
function hiddenLineSet(lines: string[], collapsed: Set<number>, foldStarts: number[]): Set<number> {
  const hidden = new Set<number>();
  for (const start of foldStarts) {
    if (!collapsed.has(start)) continue;
    const base = indentation(lines[start - 1] ?? '');
    for (let line = start + 1; line <= lines.length; line += 1) {
      if (lines[line - 1]?.trim() && indentation(lines[line - 1] ?? '') <= base) break;
      hidden.add(line);
    }
  }
  return hidden;
}
function toggleSet(current: Set<number>, line: number): Set<number> {
  const next = new Set(current);
  if (next.has(line)) next.delete(line);
  else next.add(line);
  return next;
}
function highlightLine(line: string): ReactNode {
  if (line.trim().startsWith('#')) return <span className="syntax-comment">{line}</span>;
  const match = line.match(/^(\s*(?:-\s*)?)(["']?[^:#]+["']?)(\s*:\s*)(.*)$/);
  if (!match) return <ValueText value={line} />;
  return (
    <>
      <span>{match[1]}</span>
      <span className="syntax-key">{match[2]}</span>
      <span>{match[3]}</span>
      <ValueText value={match[4] ?? ''} />
    </>
  );
}
function ValueText({ value }: { value: string }): ReactNode {
  const pieces = value.split(
    /("(?:[^"\\]|\\.)*"|'[^']*'|\b(?:true|false|null)\b|-?\d+(?:\.\d+)?)/g,
  );
  return (
    <>
      {pieces.map((piece, index) => {
        const className = /^['"]/.test(piece)
          ? 'syntax-string'
          : /^(true|false|null)$/.test(piece)
            ? 'syntax-boolean'
            : /^-?\d/.test(piece)
              ? 'syntax-number'
              : undefined;
        return (
          <span className={className} key={`${piece}-${index}`}>
            {piece}
          </span>
        );
      })}
    </>
  );
}
