import { useMemo, useState, type ReactNode } from 'react';

import { collectIssues, filterIssues, type Issue, type IssueSeverity } from './issues';
import { diagnosticsAsJson, diagnosticsAsSarif } from './diagnostic-export';
import {
  displayDocumentName,
  type DocumentResponse,
  type DocumentSummary,
  type ValidationScope,
} from './workspace';
import { quickFixesFor, type QuickFix } from './quick-fix';
import { validationProfile } from './validation-profile';

export function IssuesPanel({
  documents,
  onSelectDocument,
  onSelectView,
  onSourceLine,
  onRunValidation,
  activeDocument,
  activeSource,
  onApplyQuickFix,
}: {
  documents: DocumentSummary[];
  onSelectDocument: (document: DocumentSummary) => void;
  onSelectView: (view: 'source' | 'form' | 'graph' | 'details') => void;
  onSourceLine: (line: number) => void;
  onRunValidation?: (scope: ValidationScope) => void;
  activeDocument?: DocumentResponse | null;
  activeSource?: string | null;
  onApplyQuickFix?: (source: string, title: string) => void;
}): ReactNode {
  const [severity, setSeverity] = useState<IssueSeverity>('all');
  const [phase, setPhase] = useState('all');
  const [query, setQuery] = useState('');
  const [preview, setPreview] = useState<{ fix: QuickFix; issue: Issue } | null>(null);
  const allIssues = useMemo(() => collectIssues(documents), [documents]);
  const phases = useMemo(
    () => [...new Set(allIssues.map(({ diagnostic }) => diagnostic.phase))].sort(),
    [allIssues],
  );
  const issues = useMemo(
    () => filterIssues(allIssues, severity, phase, query),
    [allIssues, phase, query, severity],
  );

  const download = (filename: string, content: string) => {
    const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const navigate = (issue: Issue, view: 'source' | 'form' | 'graph' | 'details') => {
    onSelectDocument(issue.document);
    onSelectView(view);
    if (view === 'source' && issue.diagnostic.primaryRange) {
      onSourceLine(issue.diagnostic.primaryRange.start.line);
    }
  };

  const fixesFor = (issue: Issue): QuickFix[] => {
    if (!activeDocument || !activeSource || activeDocument.id !== issue.document.id) return [];
    return quickFixesFor(issue.document, issue.diagnostic, activeSource);
  };

  return (
    <section className="issues-panel" aria-labelledby="issues-title">
      <div className="issues-heading">
        <div>
          <p className="eyebrow">
            Local validation · {validationProfile.ruleSetVersion} · no remote schemas
          </p>
          <h2 id="issues-title">Issues</h2>
        </div>
        <span className="badge badge-neutral" aria-label={`${allIssues.length} total issues`}>
          {allIssues.length} total
        </span>
      </div>
      <div className="issues-actions" aria-label="Validation actions">
        {onRunValidation && (
          <>
            <label>
              <span>Validation scope</span>
              <select
                aria-label="Validation scope"
                defaultValue="document"
                onChange={(event) => onRunValidation(event.target.value as ValidationScope)}
              >
                <option value="document">Current document</option>
                <option value="dependencies">Dependency closure</option>
                <option value="workspace">Entire workspace</option>
              </select>
            </label>
          </>
        )}
        <button
          className="button button-quiet"
          type="button"
          onClick={() => download('openworkflow-diagnostics.json', diagnosticsAsJson(allIssues))}
          disabled={allIssues.length === 0}
        >
          Export JSON
        </button>
        <button
          className="button button-quiet"
          type="button"
          onClick={() => download('openworkflow-diagnostics.sarif', diagnosticsAsSarif(allIssues))}
          disabled={allIssues.length === 0}
        >
          Export SARIF
        </button>
      </div>
      <div className="issues-filters" aria-label="Issue filters">
        <label>
          <span>Severity</span>
          <select
            value={severity}
            onChange={(event) => setSeverity(event.target.value as IssueSeverity)}
          >
            <option value="all">All severities</option>
            <option value="error">Errors</option>
            <option value="warning">Warnings</option>
            <option value="info">Info</option>
            <option value="hint">Hints</option>
          </select>
        </label>
        <label>
          <span>Phase</span>
          <select value={phase} onChange={(event) => setPhase(event.target.value)}>
            <option value="all">All phases</option>
            {phases.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <label className="issues-search">
          <span>Search issues</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Rule, file, or message"
          />
        </label>
      </div>
      {issues.length === 0 ? (
        <div className="issues-empty" role="status">
          <strong>
            {allIssues.length === 0 ? 'No diagnostics detected' : 'No matching issues'}
          </strong>
          <p>
            Validation is deterministic and local to the checked-in {validationProfile.workflow} and{' '}
            {validationProfile.catalog} profiles.
          </p>
        </div>
      ) : (
        <div className="issues-list" role="list" aria-label="Validation issues">
          {issues.map(({ document, diagnostic }) => {
            const range = diagnostic.primaryRange;
            return (
              <article
                className={`issue-card issue-${diagnostic.severity}`}
                role="listitem"
                key={`${document.id}:${diagnostic.id}`}
              >
                <div className="issue-card-heading">
                  <span className={`issue-severity issue-severity-${diagnostic.severity}`}>
                    {diagnostic.severity}
                  </span>
                  <strong>{diagnostic.ruleId}</strong>
                  <span className="issue-phase">{diagnostic.phase}</span>
                </div>
                <p className="issue-document">{document.path}</p>
                <p className="issue-message">{diagnostic.message}</p>
                {diagnostic.explanation && <p>{diagnostic.explanation}</p>}
                {diagnostic.suggestedResolution && (
                  <p className="issue-resolution">Resolution: {diagnostic.suggestedResolution}</p>
                )}
                <div className="issue-footer">
                  <span>
                    {range
                      ? `Line ${range.start.line}, column ${range.start.column}`
                      : 'Source range unavailable'}
                  </span>
                  <span className="issue-nav-actions">
                    {onApplyQuickFix &&
                      fixesFor({ document, diagnostic }).map((fix) => (
                        <button
                          className="button button-secondary"
                          type="button"
                          key={fix.id}
                          onClick={() => setPreview({ fix, issue: { document, diagnostic } })}
                        >
                          Quick fix
                        </button>
                      ))}
                    {diagnostic.documentationUrl && (
                      <a
                        className="button button-quiet"
                        href={diagnostic.documentationUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Rule documentation
                      </a>
                    )}
                    {diagnostic.suppressible && (
                      <span className="issue-policy">Suppressible by policy</span>
                    )}
                    {(['source', 'form', 'graph', 'details'] as const).map((view) => (
                      <button
                        className="button button-quiet"
                        type="button"
                        key={view}
                        onClick={() => navigate({ document, diagnostic }, view)}
                      >
                        {view === 'source' && range
                          ? `Source ${range.start.line}`
                          : view.charAt(0).toUpperCase() + view.slice(1)}
                      </button>
                    ))}
                  </span>
                </div>
                <span className="sr-only">{displayDocumentName(document)}</span>
              </article>
            );
          })}
        </div>
      )}
      {preview && onApplyQuickFix && (
        <div
          className="save-preview quick-fix-preview"
          role="dialog"
          aria-labelledby="quick-fix-title"
        >
          <div>
            <p className="eyebrow">Draft-only change · no canonical write yet</p>
            <h2 id="quick-fix-title">{preview.fix.title}</h2>
            <p className="muted-copy">{preview.fix.description}</p>
            <p className="muted-copy">
              Review the complete source diff. Applying it updates the browser draft only; save
              remains a separate ETag-guarded operation.
            </p>
            <pre>
              {diffPreview(activeSource ?? preview.issue.document.path, preview.fix.source)}
            </pre>
          </div>
          <div className="context-actions">
            <button
              className="button button-secondary"
              type="button"
              onClick={() => setPreview(null)}
            >
              Cancel
            </button>
            <button
              className="button button-primary"
              type="button"
              onClick={() => {
                onApplyQuickFix(preview.fix.source, preview.fix.title);
                setPreview(null);
              }}
            >
              Apply to draft
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function diffPreview(before: string, after: string, limit = 320): string {
  const left = before.split(/\r?\n/);
  const right = after.split(/\r?\n/);
  const lines: string[] = [];
  const count = Math.max(left.length, right.length);
  for (let index = 0; index < count; index += 1) {
    if (left[index] === right[index]) {
      if (left[index] !== undefined) lines.push(`  ${left[index]}`);
    } else {
      if (left[index] !== undefined) lines.push(`- ${left[index]}`);
      if (right[index] !== undefined) lines.push(`+ ${right[index]}`);
    }
  }
  return lines.slice(0, limit).join('\n') || 'No textual changes.';
}
