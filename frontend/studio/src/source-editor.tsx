import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { formatBytes, type DocumentResponse } from './workspace';

export function SourceEditor({
  document,
  value,
  onChange,
  onSave,
  onSaveAs,
  onExport,
  onFormat,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  canSave,
  saving,
}: {
  document: DocumentResponse;
  value: string;
  onChange: (value: string) => void;
  onSave: () => void;
  onSaveAs: () => void;
  onExport: () => void;
  onFormat: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  canSave: boolean;
  saving: boolean;
}): ReactNode {
  const [query, setQuery] = useState('');
  const [replace, setReplace] = useState('');
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const lines = useMemo(() => value.split(/\r?\n/), [value]);
  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return needle ? lines.filter((line) => line.toLowerCase().includes(needle)).length : 0;
  }, [lines, query]);
  useEffect(() => {
    if (!query) return;
    const first = lines.findIndex((line) => line.toLowerCase().includes(query.toLowerCase()));
    if (first >= 0) editorRef.current?.setSelectionRange(value.indexOf(lines[first] ?? ''), 0);
  }, [lines, query, value]);
  const replaceAll = () => {
    if (!query) return;
    onChange(value.split(query).join(replace));
  };
  return (
    <section className="source-view source-editor-view" aria-labelledby="source-editor-title">
      <div className="source-toolbar">
        <div>
          <p className="eyebrow">Editable source · {document.format.toUpperCase()}</p>
          <h2 id="source-editor-title">{document.path}</h2>
        </div>
        <div className="source-actions">
          <label className="source-search">
            <span className="sr-only">Find in source</span>
            <span aria-hidden="true">⌕</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Find"
            />
          </label>
          <label className="source-search source-replace">
            <span className="sr-only">Replace with</span>
            <span aria-hidden="true">↪</span>
            <input
              value={replace}
              onChange={(event) => setReplace(event.target.value)}
              placeholder="Replace"
            />
          </label>
          <button
            className="button button-secondary"
            type="button"
            onClick={replaceAll}
            disabled={!query}
          >
            Replace all
          </button>
          <button className="button button-secondary" type="button" onClick={onFormat}>
            Format
          </button>
          <button
            className="button button-secondary"
            type="button"
            onClick={onUndo}
            disabled={!canUndo}
          >
            Undo
          </button>
          <button
            className="button button-secondary"
            type="button"
            onClick={onRedo}
            disabled={!canRedo}
          >
            Redo
          </button>
          <button className="button button-secondary" type="button" onClick={onSaveAs}>
            Save as
          </button>
          <button className="button button-secondary" type="button" onClick={onExport}>
            Export
          </button>
          <button
            className="button button-primary"
            type="button"
            onClick={onSave}
            disabled={!canSave || saving}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
      <div className="source-status" role="status">
        {lines.length} lines · {formatBytes(new TextEncoder().encode(value).length)} · revision{' '}
        {document.revisionNumber}
        {query && ` · ${matches} match${matches === 1 ? '' : 'es'}`}
      </div>
      <div className="source-editor-shell">
        <div className="source-line-numbers" aria-hidden="true">
          {lines.map((_, index) => (
            <span key={index}>{index + 1}</span>
          ))}
        </div>
        <textarea
          ref={editorRef}
          className="source-editor"
          aria-label="Editable canonical source"
          spellCheck={false}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      </div>
    </section>
  );
}
