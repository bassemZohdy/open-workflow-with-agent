import {
  Component,
  type ErrorInfo,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  documentDirectory,
  documentHref,
  documentIdFromLocation,
  documentMatches,
  displayDocumentName,
  createDocument,
  deleteDocument,
  fetchDocument,
  fetchDocuments,
  formatBytes,
  formatModifiedAt,
  renameDocument,
  updateDocument,
  validateDocument,
  validateScope,
  type DocumentKind,
  type DocumentResponse,
  type DocumentSummary,
  type ValidationResponse,
  type ValidationScope,
  type ValidationState,
  WorkspaceApiError,
} from './workspace';
import { MetadataView, SourceViewer } from './document-view';
import { SourceEditor } from './source-editor';
import { templateFor, templatePath, type TemplateKind } from './templates';
import { mergeThreeWay } from './draft-helpers';
import { MetadataEditor } from './metadata-editor';
import { GraphView } from './graph-view';
import { CatalogEditor, CatalogView, DependencyPanel } from './catalog-view';
import { IssuesPanel } from './issues-panel';
import { ExecutionPanel } from './execution-panel';
import { dependencyImpact, type DependencyImpact } from './delete-impact';
import { importPolicy, MAX_IMPORT_BYTES } from './import-policy';
import { extractSubflowStateRange, type SubflowExtractionResult } from './subflow-extraction';
import {
  autosaveDelayOptions,
  readAutosaveSettings,
  writeAutosaveSettings,
  type AutosaveSettings,
} from './autosave';

type RuntimeState = 'checking' | 'healthy' | 'unavailable' | 'forbidden';
type Theme = 'system' | 'light' | 'dark' | 'high-contrast';
type View = 'source' | 'form' | 'graph' | 'details';
type LoadState = 'loading' | 'ready' | 'error';
type Filters = {
  query: string;
  kind: 'all' | DocumentKind;
  version: string;
  stateType: string;
  catalog: string;
  validation: 'all' | ValidationState;
  reusableSubflow: boolean;
};
type ErrorBoundaryProps = { children: ReactNode };
type ErrorBoundaryState = { error: Error | null };
type ImportMetadata = {
  name: string;
  path: string;
  kind: DocumentKind;
  format: 'yaml' | 'json';
  sizeBytes: number;
  importedAt: string;
};

export class StudioErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState = { error: null };
  public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }
  public componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Studio fatal render error', error, info.componentStack);
  }
  public render(): ReactNode {
    if (this.state.error)
      return (
        <main className="fatal-screen" aria-labelledby="fatal-title">
          <div className="fatal-card">
            <p className="eyebrow">OpenWorkflow Studio</p>
            <h1 id="fatal-title">Studio could not render</h1>
            <p>
              The open document is still protected in the browser. Reload the Studio or copy any
              draft you were working on before retrying.
            </p>
            <button
              className="button button-primary"
              type="button"
              onClick={() => location.reload()}
            >
              Reload Studio
            </button>
          </div>
        </main>
      );
    return this.props.children;
  }
}

const views: Array<{ id: View; label: string }> = [
  { id: 'source', label: 'Source' },
  { id: 'form', label: 'Form' },
  { id: 'graph', label: 'Graph' },
  { id: 'details', label: 'Details' },
];

async function checkRuntime(): Promise<RuntimeState> {
  try {
    const response = await fetch('/q/health', { headers: { Accept: 'application/json' } });
    if (response.status === 401 || response.status === 403) return 'forbidden';
    return response.ok ? 'healthy' : 'unavailable';
  } catch {
    return 'unavailable';
  }
}

function runtimeLabel(state: RuntimeState): string {
  if (state === 'checking') return 'Checking runtime';
  if (state === 'healthy') return 'Runtime healthy';
  if (state === 'forbidden') return 'Runtime access required';
  return 'Runtime unavailable';
}

type DraftHistory = { past: string[]; future: string[] };
type ConflictState = { server: DocumentResponse; local: string };
type DeleteImpactState = {
  document: DocumentSummary;
  message: string;
  dependencies: DependencyImpact[];
};
type ExtractionPreview = SubflowExtractionResult & {
  documentId: string;
  documentEtag: string;
  source: string;
  subflowId: string;
  subflowName: string;
  subflowPath: string;
};

function discardUnsavedChanges(): boolean {
  return typeof window.confirm !== 'function' || window.confirm('Discard unsaved changes?');
}

function formatDraft(content: string): string {
  const formatted = content
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .join('\n');
  return formatted.endsWith('\n') ? formatted : `${formatted}\n`;
}

function copyPath(path: string): string {
  const extension = path.endsWith('.json')
    ? '.json'
    : path.endsWith('.yaml')
      ? '.yaml'
      : '.sw.yaml';
  const base = path.slice(0, -extension.length);
  return `${base}-copy${extension}`;
}

function diffPreview(before: string, after: string, limit = 240): string {
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

function useWorkspaceDocuments(refreshKey: number): {
  documents: DocumentSummary[];
  total: number;
  loadState: LoadState;
  error: string | null;
} {
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void fetchDocuments(controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) {
          setDocuments(result.items);
          setTotal(result.total);
          setLoadState('ready');
        }
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        setLoadState('error');
        setError(
          reason instanceof WorkspaceApiError
            ? reason.message
            : 'The workspace API could not be reached. The root console remains available.',
        );
      });
    return () => controller.abort();
  }, [refreshKey]);
  return { documents, total, loadState, error };
}

function initialFilters(): Filters {
  return {
    query: '',
    kind: 'all',
    version: 'all',
    stateType: 'all',
    catalog: 'all',
    validation: 'all',
    reusableSubflow: false,
  };
}
function isReusableSubflow(document: DocumentSummary): boolean {
  return document.reusableSubflow === true || document.path.includes('/sub_flows/');
}
function kindLabel(kind: DocumentKind): string {
  return kind === 'catalog' ? 'Catalog' : 'Workflow';
}
function validationLabel(state: ValidationState): string {
  return state === 'parse-error'
    ? 'Parse error'
    : state === 'unsupported'
      ? 'Unsupported'
      : 'Parsed';
}
function statusLabel(document: DocumentSummary): string {
  if (document.validationState === 'parse-error') return 'Parse error';
  if (document.validationState === 'unsupported') return 'Unsupported';
  return document.kind === 'catalog'
    ? `OpenAPI ${document.openapi ?? 'unknown'}`
    : `Spec ${document.specVersion ?? 'unknown'}`;
}
function generationLabel(state: DocumentSummary['generation']['state']): string {
  if (state === 'in_sync') return 'Generated in sync';
  if (state === 'pending') return 'Sync pending';
  if (state === 'blocked') return 'Sync blocked';
  if (state === 'disabled') return 'Sync disabled';
  return 'Generated out of sync';
}

function DocumentRow({
  document,
  selected,
  onSelect,
  onKeyDown,
}: {
  document: DocumentSummary;
  selected: boolean;
  onSelect: () => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) => void;
}): ReactNode {
  return (
    <button
      className={`document-row ${selected ? 'is-selected' : ''}`}
      type="button"
      role="option"
      aria-selected={selected}
      tabIndex={selected ? 0 : -1}
      onClick={onSelect}
      onKeyDown={onKeyDown}
    >
      <span className="document-row-main">
        <strong>{displayDocumentName(document)}</strong>
        <small>{document.path}</small>
      </span>
      <span className="document-row-meta">
        <span className={`mini-status mini-status-${document.validationState}`}>
          {validationLabel(document.validationState)}
        </span>
        <span className="document-row-size">{formatBytes(document.sizeBytes)}</span>
      </span>
    </button>
  );
}

function DocumentDetail({ document }: { document: DocumentSummary }): ReactNode {
  return (
    <section
      className={`document-detail detail-${document.validationState}`}
      aria-labelledby="document-title"
    >
      <div className="detail-heading">
        <div>
          <p className="eyebrow">
            {kindLabel(document.kind)} · {document.format.toUpperCase()}
          </p>
          <h2 id="document-title">{displayDocumentName(document)}</h2>
          <p className="detail-path">{document.path}</p>
        </div>
        <div className="detail-statuses">
          <span className={`badge badge-${document.validationState}`}>{statusLabel(document)}</span>
          <span className={`badge badge-generation-${document.generation.state}`}>
            {generationLabel(document.generation.state)}
          </span>
        </div>
      </div>
      <dl className="metadata-grid">
        <div>
          <dt>Document ID</dt>
          <dd>{document.id}</dd>
        </div>
        <div>
          <dt>Version</dt>
          <dd>{document.documentVersion ?? '—'}</dd>
        </div>
        <div>
          <dt>Specification</dt>
          <dd>{document.specVersion ?? document.openapi ?? '—'}</dd>
        </div>
        <div>
          <dt>Size</dt>
          <dd>{formatBytes(document.sizeBytes)}</dd>
        </div>
        <div>
          <dt>Modified</dt>
          <dd>{formatModifiedAt(document.modifiedAt)}</dd>
        </div>
        <div>
          <dt>Revision</dt>
          <dd>{document.revisionNumber}</dd>
        </div>
      </dl>
      <div className="detail-columns">
        <div>
          <h3>State types</h3>
          {document.stateTypes.length > 0 ? (
            <div className="token-row">
              {document.stateTypes.map((stateType) => (
                <span className="token token-state" key={stateType}>
                  {stateType}
                </span>
              ))}
            </div>
          ) : (
            <p className="muted-copy">No workflow states detected.</p>
          )}
        </div>
        <div>
          <h3>Catalog references</h3>
          {document.catalogAliases.length > 0 ? (
            <div className="token-row">
              {document.catalogAliases.map((alias) => (
                <span className="token token-operation" key={alias}>
                  {alias}
                </span>
              ))}
            </div>
          ) : (
            <p className="muted-copy">No catalog aliases detected.</p>
          )}
        </div>
      </div>
      {document.diagnostics.length > 0 && (
        <div className="diagnostic-panel" role="alert">
          <h3>Visible diagnostics</h3>
          <ul>
            {document.diagnostics.map((diagnostic) => (
              <li key={diagnostic.id}>{diagnostic.message}</li>
            ))}
          </ul>
        </div>
      )}
      <p className="detail-footnote">
        Raw source remains the source of truth. Save operations are guarded by ETags and the
        configured workspace boundary.
      </p>
    </section>
  );
}

function SelectedDocumentPanel({
  summary,
  document,
  view,
  error,
  sourceLine,
  onSourceLine,
  documents,
  onSelectDocument,
  focusOperationId,
  draft,
  dirty,
  onDraftChange,
  onSave,
  onSaveAs,
  onExport,
  onFormat,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  saving,
  onOpenSource,
  onOpenForm,
  onExtractRange,
  formStateName,
}: {
  summary: DocumentSummary;
  document: DocumentResponse | null;
  view: View;
  error: string | null;
  sourceLine: number | null;
  onSourceLine: (line: number) => void;
  documents: DocumentSummary[];
  onSelectDocument: (document: DocumentSummary, operationId?: string) => void;
  focusOperationId: string | null;
  draft: string | null;
  dirty: boolean;
  onDraftChange: (value: string) => void;
  onSave: () => void;
  onSaveAs: () => void;
  onExport: () => void;
  onFormat: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  saving: boolean;
  onOpenSource: (line?: number) => void;
  onOpenForm: (stateName: string) => void;
  onExtractRange: (stateNames: string[]) => void;
  formStateName: string | null;
}): ReactNode {
  if (!document) {
    return (
      <div className="document-loading" role={error ? 'alert' : 'status'}>
        {error ? (
          <>
            <strong>Document unavailable</strong>
            <p>{error}</p>
          </>
        ) : (
          <>
            Loading canonical source for <strong>{displayDocumentName(summary)}</strong>…
          </>
        )}
      </div>
    );
  }
  if (view === 'source')
    return (
      <>
        <SourceEditor
          document={document}
          value={draft ?? document.content}
          onChange={onDraftChange}
          onSave={onSave}
          onSaveAs={onSaveAs}
          onExport={onExport}
          onFormat={onFormat}
          canSave={dirty}
          saving={saving}
          onUndo={onUndo}
          onRedo={onRedo}
          canUndo={canUndo}
          canRedo={canRedo}
        />
        {sourceLine && (
          <SourceViewer
            document={{ ...document, content: draft ?? document.content }}
            selectedLine={sourceLine}
            onSelectLine={onSourceLine}
          />
        )}
      </>
    );
  if (view === 'graph')
    return (
      <GraphView
        key={document.id}
        document={document}
        source={draft ?? document.content}
        onChange={onDraftChange}
        onSourceLine={onSourceLine}
        onOpenForm={onOpenForm}
        onExtractRange={onExtractRange}
      />
    );
  if (view === 'details') {
    if (document.kind === 'catalog') {
      return (
        <CatalogView
          document={document}
          documents={documents}
          focusOperationId={focusOperationId}
          onSourceLine={onSourceLine}
          onSelectDocument={onSelectDocument}
        />
      );
    }
    return (
      <>
        <MetadataView document={document} onSourceLine={onSourceLine} />
        <DependencyPanel
          document={document}
          documents={documents}
          onSelectDocument={onSelectDocument}
        />
      </>
    );
  }
  if (document.kind === 'workflow') {
    return (
      <MetadataEditor
        document={document}
        source={draft ?? document.content}
        onChange={onDraftChange}
        onSave={onSave}
        onOpenSource={onOpenSource}
        initialStateName={formStateName}
        dirty={dirty}
        saving={saving}
        catalogs={documents.filter((candidate) => candidate.kind === 'catalog')}
        subflows={documents.filter(
          (candidate) => candidate.kind === 'workflow' && isReusableSubflow(candidate),
        )}
        onSelectSubflow={onSelectDocument}
      />
    );
  }
  if (document.kind === 'catalog') {
    return (
      <CatalogEditor
        document={document}
        source={draft ?? document.content}
        onChange={onDraftChange}
        onSave={onSave}
        onOpenSource={onOpenSource}
        dirty={dirty}
        saving={saving}
        documents={documents}
      />
    );
  }
  return <DocumentDetail document={summary} />;
}

export function App(): ReactNode {
  const [runtime, setRuntime] = useState<RuntimeState>('checking');
  const [theme, setTheme] = useState<Theme>('system');
  const [view, setView] = useState<View>('source');
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(() => documentIdFromLocation());
  const [notice, setNotice] = useState('Loading canonical workspace documents.');
  const [lastImport, setLastImport] = useState<ImportMetadata | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const { documents, total, loadState, error } = useWorkspaceDocuments(refreshKey);
  const [loadedDocumentId, setLoadedDocumentId] = useState<string | null>(null);
  const [activeDocument, setActiveDocument] = useState<DocumentResponse | null>(null);
  const [documentError, setDocumentError] = useState<string | null>(null);
  const [sourceLine, setSourceLine] = useState<number | null>(null);
  const [formStateName, setFormStateName] = useState<string | null>(null);
  const [focusOperationId, setFocusOperationId] = useState<string | null>(null);
  const [issuesOpen, setIssuesOpen] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [baseContents, setBaseContents] = useState<Record<string, string>>({});
  const [histories, setHistories] = useState<Record<string, DraftHistory>>({});
  const [saving, setSaving] = useState(false);
  const [savePreview, setSavePreview] = useState(false);
  const [formatWarning, setFormatWarning] = useState(false);
  const [draftDiagnostics, setDraftDiagnostics] = useState<Record<string, string[]>>({});
  const [draftSourceTrees, setDraftSourceTrees] = useState<
    Record<string, Record<string, unknown> | null>
  >({});
  const [validationDocuments, setValidationDocuments] = useState<DocumentSummary[] | null>(null);
  const [conflict, setConflict] = useState<ConflictState | null>(null);
  const [deleteImpact, setDeleteImpact] = useState<DeleteImpactState | null>(null);
  const [extractionPreview, setExtractionPreview] = useState<ExtractionPreview | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [autosaveSettings, setAutosaveSettings] = useState<AutosaveSettings>(() =>
    readAutosaveSettings(typeof window === 'undefined' ? null : window.localStorage),
  );
  useEffect(() => {
    let mounted = true;
    void checkRuntime().then((state) => {
      if (mounted) setRuntime(state);
    });
    return () => {
      mounted = false;
    };
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (Object.entries(drafts).some(([id, content]) => content !== baseContents[id])) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [baseContents, drafts]);
  const visibleDocuments = useMemo(
    () => documents.filter((document) => documentMatches(document, filters)),
    [documents, filters],
  );
  const effectiveSelectedId =
    selectedId && documents.some((document) => document.id === selectedId)
      ? selectedId
      : (visibleDocuments[0]?.id ?? documents[0]?.id ?? null);
  const selectedDocument =
    documents.find((document) => document.id === effectiveSelectedId) ?? null;
  useEffect(() => {
    if (!selectedDocument) return;
    const controller = new AbortController();
    void fetchDocument(selectedDocument, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        setActiveDocument(result);
        setLoadedDocumentId(selectedDocument.id);
        setBaseContents((current) => ({ ...current, [result.id]: result.content }));
        setDrafts((current) => {
          if (current[result.id] !== undefined) return current;
          const recoveryKey = `studio.draft.v1:${result.id}`;
          const stored = window.localStorage.getItem(recoveryKey);
          if (stored) {
            try {
              const parsed = JSON.parse(stored) as { content?: unknown };
              if (typeof parsed.content === 'string' && parsed.content !== result.content) {
                if (window.confirm(`Restore the recoverable draft for ${result.path}?`)) {
                  return { ...current, [result.id]: parsed.content };
                }
              }
            } catch {
              window.localStorage.removeItem(recoveryKey);
            }
          }
          return { ...current, [result.id]: result.content };
        });
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        setDocumentError(
          reason instanceof WorkspaceApiError
            ? reason.message
            : 'The document could not be loaded.',
        );
        setLoadedDocumentId(null);
      });
    return () => controller.abort();
  }, [selectedDocument]);
  useEffect(() => {
    for (const [id, content] of Object.entries(drafts)) {
      if (content !== baseContents[id]) {
        window.localStorage.setItem(
          `studio.draft.v1:${id}`,
          JSON.stringify({ content, savedAt: new Date().toISOString() }),
        );
      } else {
        window.localStorage.removeItem(`studio.draft.v1:${id}`);
      }
    }
  }, [baseContents, drafts]);
  useEffect(() => {
    writeAutosaveSettings(
      typeof window === 'undefined' ? null : window.localStorage,
      autosaveSettings,
    );
  }, [autosaveSettings]);
  const selectedDocumentReady =
    selectedDocument && loadedDocumentId === selectedDocument.id ? activeDocument : null;
  const currentDraft = selectedDocumentReady
    ? (drafts[selectedDocumentReady.id] ?? selectedDocumentReady.content)
    : null;
  const currentDirty = Boolean(
    selectedDocumentReady && currentDraft !== baseContents[selectedDocumentReady.id],
  );
  const runValidationScope = useCallback(
    (scope: ValidationScope) => {
      if (scope !== 'workspace' && !selectedDocumentReady) {
        setNotice('Select a document before running document or dependency validation.');
        return;
      }
      setNotice(`Running ${scope} validation…`);
      void validateScope(scope, selectedDocumentReady, currentDirty ? currentDraft : null)
        .then((report) => {
          const summaries = report.documents.flatMap((validated) => {
            const summary = documents.find((document) => document.id === validated.id);
            return summary ? [{ ...summary, diagnostics: validated.diagnostics }] : [];
          });
          setValidationDocuments(summaries);
          setIssuesOpen(true);
          setNotice(
            `${report.scope} validation checked ${report.documentsChecked} document${report.documentsChecked === 1 ? '' : 's'} and found ${report.diagnostics.length} issue${report.diagnostics.length === 1 ? '' : 's'}.`,
          );
        })
        .catch((reason: unknown) => {
          setNotice(
            reason instanceof WorkspaceApiError
              ? reason.message
              : 'The selected validation scope could not be evaluated.',
          );
        });
    },
    [currentDirty, currentDraft, documents, selectedDocumentReady],
  );
  const anyDirty = Object.entries(drafts).some(([id, content]) => content !== baseContents[id]);
  const selectedDocumentProjection =
    selectedDocumentReady &&
    currentDirty &&
    Object.prototype.hasOwnProperty.call(draftSourceTrees, selectedDocumentReady.id)
      ? {
          ...selectedDocumentReady,
          sourceTree: draftSourceTrees[selectedDocumentReady.id] ?? null,
        }
      : selectedDocumentReady;
  const recordDraftValidation = useCallback((id: string, result: ValidationResponse) => {
    setDraftDiagnostics((items) => ({
      ...items,
      [id]: result.diagnostics.map((diagnostic) => diagnostic.message),
    }));
    if (result.sourceTree !== undefined) {
      setDraftSourceTrees((items) => ({ ...items, [id]: result.sourceTree }));
    }
  }, []);
  useEffect(() => {
    if (!selectedDocumentReady || !currentDirty || !currentDraft) return;
    const documentToValidate = selectedDocumentReady;
    const draftToValidate = currentDraft;
    const timer = window.setTimeout(() => {
      void validateDocument(documentToValidate, draftToValidate)
        .then((result) => {
          if (
            selectedDocumentReady.id !== documentToValidate.id ||
            currentDraft !== draftToValidate
          )
            return;
          recordDraftValidation(documentToValidate.id, result);
        })
        .catch(() => undefined);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [currentDirty, currentDraft, recordDraftValidation, selectedDocumentReady]);
  useEffect(() => {
    const onPopState = () => {
      if (anyDirty && !discardUnsavedChanges()) {
        if (selectedDocument) window.history.pushState({}, '', documentHref(selectedDocument));
        return;
      }
      setSelectedId(documentIdFromLocation());
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [anyDirty, selectedDocument]);
  const versions = useMemo(
    () =>
      uniqueOptions(
        documents.map((document) => document.specVersion ?? document.openapi ?? 'unknown'),
      ),
    [documents],
  );
  const stateTypes = useMemo(
    () => uniqueOptions(documents.flatMap((document) => document.stateTypes)),
    [documents],
  );
  const catalogs = useMemo(
    () => uniqueOptions(documents.flatMap((document) => document.catalogAliases)),
    [documents],
  );
  const groups = useMemo(() => groupDocuments(visibleDocuments), [visibleDocuments]);
  const selectDocument = useCallback(
    (document: DocumentSummary, operationId?: string) => {
      if (document.id !== effectiveSelectedId && anyDirty && !discardUnsavedChanges()) return;
      window.history.pushState({}, '', documentHref(document));
      setSelectedId(document.id);
      setFocusOperationId(operationId ?? null);
      setNotice(`Selected ${displayDocumentName(document)}.`);
    },
    [anyDirty, effectiveSelectedId],
  );

  const updateDraft = useCallback(
    (value: string) => {
      if (!selectedDocumentReady) return;
      const id = selectedDocumentReady.id;
      const current = drafts[id] ?? selectedDocumentReady.content;
      if (current === value) return;
      setDrafts((items) => ({ ...items, [id]: value }));
      setDraftSourceTrees((items) => {
        if (!Object.prototype.hasOwnProperty.call(items, id)) return items;
        const next = { ...items };
        delete next[id];
        return next;
      });
      setHistories((items) => {
        const history = items[id] ?? { past: [], future: [] };
        return { ...items, [id]: { past: [...history.past, current].slice(-100), future: [] } };
      });
    },
    [drafts, selectedDocumentReady],
  );

  const undoDraft = useCallback(() => {
    if (!selectedDocumentReady) return;
    const id = selectedDocumentReady.id;
    const history = histories[id] ?? { past: [], future: [] };
    const previous = history.past.at(-1);
    if (previous === undefined) return;
    const current = drafts[id] ?? selectedDocumentReady.content;
    setDrafts((items) => ({ ...items, [id]: previous }));
    setDraftSourceTrees((items) => {
      if (!Object.prototype.hasOwnProperty.call(items, id)) return items;
      const next = { ...items };
      delete next[id];
      return next;
    });
    setHistories((items) => ({
      ...items,
      [id]: { past: history.past.slice(0, -1), future: [current, ...history.future] },
    }));
  }, [drafts, histories, selectedDocumentReady]);

  const redoDraft = useCallback(() => {
    if (!selectedDocumentReady) return;
    const id = selectedDocumentReady.id;
    const history = histories[id] ?? { past: [], future: [] };
    const next = history.future[0];
    if (next === undefined) return;
    const current = drafts[id] ?? selectedDocumentReady.content;
    setDrafts((items) => ({ ...items, [id]: next }));
    setDraftSourceTrees((items) => {
      if (!Object.prototype.hasOwnProperty.call(items, id)) return items;
      const next = { ...items };
      delete next[id];
      return next;
    });
    setHistories((items) => ({
      ...items,
      [id]: { past: [...history.past, current], future: history.future.slice(1) },
    }));
  }, [drafts, histories, selectedDocumentReady]);

  const saveDraft = useCallback(
    async (automatic = false) => {
      if (!selectedDocumentReady || !currentDirty) return;
      setSaving(true);
      try {
        const saved = await updateDocument(
          selectedDocumentReady,
          currentDraft ?? selectedDocumentReady.content,
          selectedDocumentReady.etag,
        );
        setActiveDocument(saved);
        setBaseContents((items) => ({ ...items, [saved.id]: saved.content }));
        setDrafts((items) => ({ ...items, [saved.id]: saved.content }));
        setHistories((items) => ({ ...items, [saved.id]: { past: [], future: [] } }));
        setDraftSourceTrees((items) => {
          if (!Object.prototype.hasOwnProperty.call(items, saved.id)) return items;
          const next = { ...items };
          delete next[saved.id];
          return next;
        });
        setSavePreview(false);
        setFormatWarning(false);
        setConflict(null);
        setNotice(`${automatic ? 'Autosaved' : 'Saved'} ${saved.path}.`);
        setRefreshKey((value) => value + 1);
      } catch (reason: unknown) {
        if (
          reason instanceof WorkspaceApiError &&
          (reason.status === 409 || reason.status === 412)
        ) {
          try {
            const server = await fetchDocument(selectedDocumentReady);
            setConflict({ server, local: currentDraft ?? selectedDocumentReady.content });
            setNotice('The document changed on disk. Choose how to resolve the conflict.');
          } catch {
            setNotice('The document changed on disk and the latest version could not be loaded.');
          }
        } else {
          setNotice(reason instanceof Error ? reason.message : 'The document could not be saved.');
        }
      } finally {
        setSaving(false);
      }
    },
    [currentDirty, currentDraft, selectedDocumentReady],
  );

  useEffect(() => {
    if (
      !autosaveSettings.enabled ||
      !selectedDocumentReady ||
      !currentDirty ||
      !currentDraft ||
      saving ||
      savePreview ||
      conflict
    ) {
      return;
    }
    const documentToValidate = selectedDocumentReady;
    const draftToValidate = currentDraft;
    const timer = window.setTimeout(() => {
      void validateDocument(documentToValidate, draftToValidate)
        .then((result) => {
          if (
            selectedDocumentReady.id !== documentToValidate.id ||
            currentDraft !== draftToValidate
          )
            return;
          recordDraftValidation(documentToValidate.id, result);
          if (!result.valid) {
            setNotice('Autosave paused: fix draft validation errors before saving.');
            return;
          }
          void saveDraft(true);
        })
        .catch(() => setNotice('Autosave could not validate the current draft.'));
    }, autosaveSettings.delayMs);
    return () => window.clearTimeout(timer);
  }, [
    autosaveSettings,
    conflict,
    currentDirty,
    currentDraft,
    recordDraftValidation,
    saveDraft,
    savePreview,
    saving,
    selectedDocumentReady,
  ]);

  const saveCopy = async () => {
    if (!selectedDocumentReady) return;
    const path = window.prompt(
      'Save a copy as a workspace-relative path:',
      copyPath(selectedDocumentReady.path),
    );
    if (!path) return;
    try {
      const created = await createDocument({
        kind: selectedDocumentReady.kind,
        path,
        format: selectedDocumentReady.format,
        content: currentDraft ?? selectedDocumentReady.content,
      });
      setRefreshKey((value) => value + 1);
      setSelectedId(created.id);
      setNotice(`Created copy ${created.path}.`);
    } catch (reason: unknown) {
      setNotice(reason instanceof Error ? reason.message : 'The copy could not be created.');
    }
  };

  const extractSelectedRange = (stateNames: string[]) => {
    if (!selectedDocumentReady || selectedDocumentReady.kind !== 'workflow' || saving) return;
    const defaultName = `${displayDocumentName(selectedDocumentReady)} extracted subflow`;
    const subflowName = window.prompt('Name for the extracted subflow:', defaultName)?.trim();
    if (!subflowName) return;
    const defaultId = slugify(subflowName) || 'extracted-subflow';
    const subflowId = window.prompt('Stable id for the extracted subflow:', defaultId)?.trim();
    if (!subflowId) return;
    const extraction = extractSubflowStateRange({
      source: currentDraft ?? selectedDocumentReady.content,
      format: selectedDocumentReady.format,
      stateNames,
      subflowId,
      subflowName,
    });
    if (extraction.error) {
      setNotice(extraction.error);
      return;
    }
    const subflowPath = extractedSubflowPath(subflowName, selectedDocumentReady.format);
    setExtractionPreview({
      ...extraction,
      documentId: selectedDocumentReady.id,
      documentEtag: selectedDocumentReady.etag,
      source: currentDraft ?? selectedDocumentReady.content,
      subflowId,
      subflowName,
      subflowPath,
    });
    setNotice('Review the caller and extracted subflow diff before writing either document.');
  };

  const confirmSelectedExtraction = async () => {
    const preview = extractionPreview;
    if (!preview || !selectedDocumentReady || selectedDocumentReady.kind !== 'workflow') return;
    const currentSource = currentDraft ?? selectedDocumentReady.content;
    if (
      preview.documentId !== selectedDocumentReady.id ||
      preview.documentEtag !== selectedDocumentReady.etag ||
      preview.source !== currentSource
    ) {
      setExtractionPreview(null);
      setNotice(
        'The workflow changed while extraction was being reviewed. Generate the preview again.',
      );
      return;
    }
    setSaving(true);
    let created: DocumentResponse | null = null;
    try {
      created = await createDocument({
        kind: 'workflow',
        path: preview.subflowPath,
        format: selectedDocumentReady.format,
        content: preview.subflowSource,
      });
      const saved = await updateDocument(
        selectedDocumentReady,
        preview.workflowSource,
        selectedDocumentReady.etag,
      );
      setActiveDocument(saved);
      setBaseContents((items) => ({ ...items, [saved.id]: saved.content }));
      setDrafts((items) => ({ ...items, [saved.id]: saved.content }));
      setHistories((items) => ({ ...items, [saved.id]: { past: [], future: [] } }));
      setDraftSourceTrees((items) => {
        const next = { ...items };
        delete next[saved.id];
        return next;
      });
      setRefreshKey((value) => value + 1);
      setSelectedId(created.id);
      setView('form');
      setExtractionPreview(null);
      setNotice(
        `Extracted ${preview.selectedStates.join(', ')} into ${created.path}; saved ${saved.path}.`,
      );
    } catch (reason: unknown) {
      if (created) {
        try {
          await deleteDocument(created, created.etag);
        } catch {
          setNotice(
            `The workflow was not changed, but ${created.path} could not be rolled back. Review and remove it manually.`,
          );
          return;
        }
      }
      setNotice(
        reason instanceof Error ? reason.message : 'The selected range could not be extracted.',
      );
    } finally {
      setSaving(false);
    }
  };

  const mergeConflict = () => {
    if (!selectedDocumentReady || !conflict) return;
    const base = baseContents[selectedDocumentReady.id] ?? selectedDocumentReady.content;
    const merged = mergeThreeWay(base, conflict.local, conflict.server.content);
    setActiveDocument(conflict.server);
    setBaseContents((items) => ({ ...items, [selectedDocumentReady.id]: conflict.server.content }));
    setDrafts((items) => ({ ...items, [selectedDocumentReady.id]: merged }));
    setDraftSourceTrees((items) => {
      if (!Object.prototype.hasOwnProperty.call(items, selectedDocumentReady.id)) return items;
      const next = { ...items };
      delete next[selectedDocumentReady.id];
      return next;
    });
    setHistories((items) => ({ ...items, [selectedDocumentReady.id]: { past: [], future: [] } }));
    setConflict(null);
    setNotice('Merged the server version into the draft. Review conflict markers before saving.');
  };

  const exportDocument = () => {
    if (!selectedDocumentReady) return;
    const blob = new Blob([currentDraft ?? selectedDocumentReady.content], {
      type: selectedDocumentReady.format === 'json' ? 'application/json' : 'application/yaml',
    });
    const href = URL.createObjectURL(blob);
    const anchor = window.document.createElement('a');
    anchor.href = href;
    anchor.download = selectedDocumentReady.path.split('/').at(-1) ?? 'workflow.yaml';
    anchor.click();
    URL.revokeObjectURL(href);
    setNotice(`Exported ${selectedDocumentReady.path}.`);
  };

  const renameSelected = async () => {
    if (!selectedDocumentReady) return;
    const path = window.prompt('Rename to a workspace-relative path:', selectedDocumentReady.path);
    if (!path || path === selectedDocumentReady.path) return;
    try {
      const result = await renameDocument(selectedDocumentReady, path, selectedDocumentReady.etag);
      setRefreshKey((value) => value + 1);
      setSelectedId(result.document.id);
      setNotice(`Renamed document to ${result.document.path}.`);
    } catch (reason: unknown) {
      setNotice(reason instanceof Error ? reason.message : 'The document could not be renamed.');
    }
  };

  const deleteSelected = async () => {
    if (!selectedDocumentReady || !window.confirm(`Delete ${selectedDocumentReady.path}?`)) return;
    try {
      await deleteDocument(selectedDocumentReady, selectedDocumentReady.etag);
      setSelectedId(null);
      setActiveDocument(null);
      setRefreshKey((value) => value + 1);
      setNotice(`Moved ${selectedDocumentReady.path} to recoverable trash.`);
    } catch (reason: unknown) {
      if (reason instanceof WorkspaceApiError && reason.status === 409) {
        setDeleteImpact({
          document: selectedDocumentReady,
          message: reason.message,
          dependencies: dependencyImpact(reason.details.dependencies),
        });
        setNotice('Review the dependency impact before confirming deletion.');
      } else {
        setNotice(reason instanceof Error ? reason.message : 'The document could not be deleted.');
      }
    }
  };

  const acceptDeleteImpact = async () => {
    if (!deleteImpact) return;
    try {
      await deleteDocument(deleteImpact.document, deleteImpact.document.etag, true);
      setDeleteImpact(null);
      setSelectedId(null);
      setActiveDocument(null);
      setRefreshKey((value) => value + 1);
      setNotice(`Deleted ${deleteImpact.document.path} with dependency impact accepted.`);
    } catch (reason: unknown) {
      setNotice(reason instanceof Error ? reason.message : 'The document could not be deleted.');
    }
  };

  const createFromTemplate = async (kind: TemplateKind) => {
    const label =
      kind === 'catalog' ? 'catalog title' : kind === 'subflow' ? 'subflow name' : 'workflow name';
    const name = window.prompt(
      `New ${label}:`,
      kind === 'catalog' ? 'New Catalog' : 'New Workflow',
    );
    if (!name) return;
    const template = templateFor(kind, name);
    try {
      const created = await createDocument({
        kind: kind === 'catalog' ? 'catalog' : 'workflow',
        path: templatePath(kind, name),
        format: template.format,
        content: template.content,
      });
      setCreateOpen(false);
      setRefreshKey((value) => value + 1);
      setSelectedId(created.id);
      setNotice(`Created ${created.path}.`);
    } catch (reason: unknown) {
      setNotice(reason instanceof Error ? reason.message : 'The document could not be created.');
    }
  };

  const importFile = async (file: File | undefined) => {
    if (!file) return;
    const policy = importPolicy(file.name, file.type, file.size);
    if (policy.error) {
      setNotice(policy.error);
      if (importRef.current) importRef.current.value = '';
      return;
    }
    const content = await file.text();
    if (new TextEncoder().encode(content).length > MAX_IMPORT_BYTES) {
      setNotice('The decoded import exceeds the 2 MiB Studio limit.');
      if (importRef.current) importRef.current.value = '';
      return;
    }
    const kind: DocumentKind = policy.kind;
    const defaultPath = kind === 'catalog' ? `catalogs/${file.name}` : file.name;
    const path = window.prompt('Import to a workspace-relative path:', defaultPath);
    if (!path) return;
    try {
      const created = await createDocument({ kind, path, format: policy.format, content });
      setRefreshKey((value) => value + 1);
      setSelectedId(created.id);
      setNotice(`Imported ${created.path}.`);
      setLastImport({
        name: file.name,
        path: created.path,
        kind,
        format: policy.format,
        sizeBytes: file.size,
        importedAt: new Date().toISOString(),
      });
    } catch (reason: unknown) {
      setNotice(reason instanceof Error ? reason.message : 'The document could not be imported.');
    } finally {
      if (importRef.current) importRef.current.value = '';
    }
  };
  const selectRelativeDocument = useCallback(
    (index: number) => {
      const document = visibleDocuments[index];
      if (document) selectDocument(document);
    },
    [selectDocument, visibleDocuments],
  );
  const handleDocumentKeyDown = useCallback(
    (index: number, event: React.KeyboardEvent<HTMLButtonElement>) => {
      let nextIndex: number | null = null;
      if (event.key === 'ArrowDown') nextIndex = Math.min(index + 1, visibleDocuments.length - 1);
      if (event.key === 'ArrowUp') nextIndex = Math.max(index - 1, 0);
      if (event.key === 'Home') nextIndex = 0;
      if (event.key === 'End') nextIndex = visibleDocuments.length - 1;
      if (nextIndex !== null && nextIndex !== index) {
        event.preventDefault();
        selectRelativeDocument(nextIndex);
        window.requestAnimationFrame(() =>
          document.querySelector<HTMLElement>('[aria-selected="true"].document-row')?.focus(),
        );
      }
    },
    [selectRelativeDocument, visibleDocuments.length],
  );
  const updateFilter = <K extends keyof Filters>(key: K, value: Filters[K]) =>
    setFilters((current) => ({ ...current, [key]: value }));
  const refresh = () => {
    if (anyDirty && !discardUnsavedChanges()) return;
    setRefreshKey((current) => current + 1);
    setNotice('Refreshing the canonical workspace inventory.');
  };

  return (
    <StudioErrorBoundary>
      <div className="studio-app">
        <header className="global-bar">
          <a className="brand" href="/studio/" aria-label="OpenWorkflow Studio home">
            <span className="brand-mark" aria-hidden="true">
              ◈
            </span>
            <span>
              <strong>OpenWorkflow</strong>
              <small>Studio</small>
            </span>
          </a>
          <div className="workspace-context">
            <span className="context-label">Workspace</span>
            <strong>Reference workspace</strong>
            <span className="badge badge-neutral">Editable workspace</span>
          </div>
          <div className="global-actions">
            <button
              className="button button-quiet"
              type="button"
              onClick={() => searchRef.current?.focus()}
            >
              ⌕ <span>Search</span>
            </button>
            <button
              className="button button-quiet"
              type="button"
              aria-expanded={issuesOpen}
              aria-controls="issues-panel"
              onClick={() => setIssuesOpen((current) => !current)}
            >
              ⚠ Issues{' '}
              <span className="heading-count">
                {documents.reduce((count, item) => count + item.diagnostics.length, 0)}
              </span>
            </button>
            <span className={`status-pill status-${runtime}`} role="status" aria-live="polite">
              <span className="status-dot" aria-hidden="true" />
              {runtimeLabel(runtime)}
            </span>
            <label className="theme-control">
              <span className="sr-only">Theme</span>
              <select value={theme} onChange={(event) => setTheme(event.target.value as Theme)}>
                <option value="system">System theme</option>
                <option value="light">Light theme</option>
                <option value="dark">Dark theme</option>
                <option value="high-contrast">High contrast</option>
              </select>
            </label>
            <a className="button button-quiet" href="/" title="Open the existing execution console">
              Root console
            </a>
          </div>
        </header>
        <div className="workspace-shell">
          <nav className="primary-nav" aria-label="Studio navigation">
            <div className="nav-section-label">Workspace</div>
            <NavItem
              label="Workflows"
              icon="◇"
              count={documents.filter((document) => document.kind === 'workflow').length}
              active={filters.kind === 'workflow' && !filters.reusableSubflow}
              onClick={() => {
                updateFilter('kind', 'workflow');
                updateFilter('reusableSubflow', false);
              }}
            />
            <NavItem
              label="Subflows"
              icon="↳"
              count={documents.filter(isReusableSubflow).length}
              active={filters.reusableSubflow}
              onClick={() => {
                updateFilter('kind', 'workflow');
                updateFilter('query', '');
                updateFilter('reusableSubflow', true);
              }}
            />
            <NavItem
              label="Catalogs"
              icon="▦"
              count={documents.filter((document) => document.kind === 'catalog').length}
              active={filters.kind === 'catalog'}
              onClick={() => {
                updateFilter('kind', 'catalog');
                updateFilter('reusableSubflow', false);
              }}
            />
            <NavItem
              label="Validation"
              icon="✓"
              count={documents.reduce((count, document) => count + document.diagnostics.length, 0)}
              active={issuesOpen}
              onClick={() => setIssuesOpen(true)}
            />
            <NavItem
              label="Settings"
              icon="⚙"
              count={null}
              active={settingsOpen}
              onClick={() => setSettingsOpen((current) => !current)}
            />
            <div className="nav-footer">
              <a href="/q/swagger-ui/" target="_blank" rel="noreferrer">
                API docs ↗
              </a>
              <a href="/">Execution console ↗</a>
            </div>
          </nav>
          <aside className="explorer-panel" aria-label="Workspace explorer">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Explorer</p>
                <h2>
                  Documents <span className="heading-count">{visibleDocuments.length}</span>
                </h2>
              </div>
              <button
                className="icon-button"
                type="button"
                aria-label="Refresh workspace"
                onClick={refresh}
                disabled={loadState === 'loading'}
              >
                ↻
              </button>
            </div>
            <label className="search-field">
              <span className="sr-only">
                Search documents by name, ID, path, version, state, or catalog
              </span>
              <span aria-hidden="true">⌕</span>
              <input
                ref={searchRef}
                value={filters.query}
                onChange={(event) => updateFilter('query', event.target.value)}
                placeholder="Search documents"
              />
            </label>
            <div className="filter-grid" aria-label="Document filters">
              <label>
                <span>Kind</span>
                <select
                  value={filters.kind}
                  onChange={(event) => updateFilter('kind', event.target.value as Filters['kind'])}
                >
                  <option value="all">All kinds</option>
                  <option value="workflow">Workflows</option>
                  <option value="catalog">Catalogs</option>
                </select>
              </label>
              <label>
                <span>Version</span>
                <select
                  value={filters.version}
                  onChange={(event) => updateFilter('version', event.target.value)}
                >
                  <option value="all">All versions</option>
                  {versions.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>State type</span>
                <select
                  value={filters.stateType}
                  onChange={(event) => updateFilter('stateType', event.target.value)}
                >
                  <option value="all">All states</option>
                  {stateTypes.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Catalog</span>
                <select
                  value={filters.catalog}
                  onChange={(event) => updateFilter('catalog', event.target.value)}
                >
                  <option value="all">All catalogs</option>
                  {catalogs.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>
              <label className="filter-wide">
                <span>Validation</span>
                <select
                  value={filters.validation}
                  onChange={(event) =>
                    updateFilter('validation', event.target.value as Filters['validation'])
                  }
                >
                  <option value="all">All validation states</option>
                  <option value="valid">Parsed</option>
                  <option value="parse-error">Parse errors</option>
                  <option value="unsupported">Unsupported versions</option>
                </select>
              </label>
            </div>
            {loadState === 'loading' && (
              <div className="explorer-state" role="status">
                Loading workspace documents…
              </div>
            )}
            {loadState === 'error' && (
              <div className="explorer-state explorer-state-error" role="alert">
                <strong>Workspace unavailable</strong>
                <p>{error}</p>
                <button className="button button-secondary" type="button" onClick={refresh}>
                  Retry
                </button>
              </div>
            )}
            {loadState === 'ready' && visibleDocuments.length === 0 && (
              <div className="explorer-state" role="status">
                <span className="empty-icon" aria-hidden="true">
                  ◇
                </span>
                <strong>No matching documents</strong>
                <p>
                  Adjust the search or filters. Parse failures and unsupported versions remain in
                  the inventory.
                </p>
              </div>
            )}
            {loadState === 'ready' && visibleDocuments.length > 0 && (
              <div
                className="document-list"
                role="listbox"
                aria-label="Canonical workspace documents"
              >
                {groups.map((group) => (
                  <section
                    className="document-group"
                    key={group.key}
                    aria-labelledby={`group-${group.key}`}
                  >
                    <h3 id={`group-${group.key}`}>
                      <span>{kindLabel(group.kind)}</span>
                      <small>{group.directory}</small>
                    </h3>
                    {group.documents.map((document) => {
                      const index = visibleDocuments.indexOf(document);
                      return (
                        <DocumentRow
                          key={document.id}
                          document={document}
                          selected={document.id === effectiveSelectedId}
                          onSelect={() => selectDocument(document)}
                          onKeyDown={(event) => handleDocumentKeyDown(index, event)}
                        />
                      );
                    })}
                  </section>
                ))}
              </div>
            )}
            <p className="explorer-footer">
              {total} canonical source document{total === 1 ? '' : 's'} · generated files are
              excluded
            </p>
          </aside>
          <main className="main-panel" aria-labelledby="page-title">
            <div className="context-header">
              <div>
                <p className="breadcrumb">
                  Workspace <span aria-hidden="true">/</span>{' '}
                  {selectedDocument ? selectedDocument.path : 'Overview'}
                </p>
                <h1 id="page-title">
                  {selectedDocument ? displayDocumentName(selectedDocument) : 'Workspace explorer'}
                </h1>
                <p className="subtitle">
                  {selectedDocument
                    ? 'Inspect canonical metadata, references, diagnostics, and generated-artifact status.'
                    : 'Discover canonical workflows, subflows, and catalogs without exposing generated resources.'}
                </p>
              </div>
              <div className="context-actions">
                <span className="badge badge-info">Source of truth: workflows/</span>
                <button
                  className="button button-secondary"
                  type="button"
                  onClick={() => setIssuesOpen(true)}
                >
                  Open issues
                </button>
                <button
                  className="button button-secondary"
                  type="button"
                  onClick={() => setCreateOpen((current) => !current)}
                >
                  Create
                </button>
                <button
                  className="button button-secondary"
                  type="button"
                  onClick={() => importRef.current?.click()}
                >
                  Import
                </button>
                {selectedDocumentReady && (
                  <>
                    <button
                      className="button button-secondary"
                      type="button"
                      onClick={() => void saveCopy()}
                    >
                      Duplicate
                    </button>
                    <button
                      className="button button-secondary"
                      type="button"
                      onClick={renameSelected}
                    >
                      Rename
                    </button>
                    <button
                      className="button button-danger"
                      type="button"
                      onClick={() => void deleteSelected()}
                    >
                      Delete
                    </button>
                  </>
                )}
                <input
                  ref={importRef}
                  className="sr-only"
                  type="file"
                  accept=".yaml,.yml,.json,.sw.yaml,text/yaml,application/json"
                  onChange={(event) => void importFile(event.target.files?.[0])}
                />
              </div>
            </div>
            <div className="form-notice import-provenance" role="status">
              <strong>Local file import only</strong>
              <span>Remote URL imports are disabled; credentials are never forwarded.</span>
              {lastImport && (
                <span>
                  Last import: {lastImport.name} → {lastImport.path} · {lastImport.kind}{' '}
                  {lastImport.format.toUpperCase()} · {formatBytes(lastImport.sizeBytes)} ·{' '}
                  {formatModifiedAt(lastImport.importedAt)}
                </span>
              )}
            </div>
            {createOpen && (
              <div className="action-popover" role="dialog" aria-label="Create document">
                <strong>Create a source document</strong>
                <button
                  className="button button-secondary"
                  type="button"
                  onClick={() => void createFromTemplate('workflow')}
                >
                  Create workflow
                </button>
                <button
                  className="button button-secondary"
                  type="button"
                  onClick={() => void createFromTemplate('subflow')}
                >
                  Create subflow
                </button>
                <button
                  className="button button-secondary"
                  type="button"
                  onClick={() => void createFromTemplate('catalog')}
                >
                  Create catalog
                </button>
              </div>
            )}
            {settingsOpen && (
              <section
                className="action-popover settings-popover"
                role="dialog"
                aria-labelledby="settings-title"
              >
                <div>
                  <p className="eyebrow">Browser-only preferences</p>
                  <h2 id="settings-title">Studio settings</h2>
                  <p className="muted-copy">
                    Server workspace and access controls remain managed by the runtime. These
                    preferences stay in this browser profile.
                  </p>
                </div>
                <label className="settings-checkbox">
                  <input
                    type="checkbox"
                    checked={autosaveSettings.enabled}
                    onChange={(event) =>
                      setAutosaveSettings((current) => ({
                        ...current,
                        enabled: event.target.checked,
                      }))
                    }
                  />
                  <span>Enable autosave</span>
                </label>
                <label className="settings-field">
                  <span>Autosave after idle</span>
                  <select
                    value={autosaveSettings.delayMs}
                    onChange={(event) =>
                      setAutosaveSettings((current) => ({
                        ...current,
                        delayMs: Number(event.target.value),
                      }))
                    }
                    disabled={!autosaveSettings.enabled}
                  >
                    {autosaveDelayOptions.map((delayMs) => (
                      <option value={delayMs} key={delayMs}>
                        {delayMs / 1000} seconds
                      </option>
                    ))}
                  </select>
                </label>
                <p className="settings-note" role="note">
                  Autosave is disabled by default. When enabled, Studio validates the draft first,
                  saves only valid drafts, and uses the same ETag conflict protection as manual
                  saves.
                </p>
                <button
                  className="button button-secondary"
                  type="button"
                  onClick={() => setSettingsOpen(false)}
                >
                  Close settings
                </button>
              </section>
            )}
            {extractionPreview &&
              selectedDocumentReady &&
              extractionPreview.documentId === selectedDocumentReady.id && (
                <div
                  className="save-preview extraction-preview"
                  role="dialog"
                  aria-labelledby="extraction-preview-title"
                >
                  <div>
                    <p className="eyebrow">Two-document change review · no writes yet</p>
                    <h2 id="extraction-preview-title">Review extracted subflow</h2>
                    <p className="muted-copy">
                      The caller will be replaced with a subflow invocation and a new document will
                      be created at <code>{extractionPreview.subflowPath}</code>. Confirm only after
                      reviewing both source changes.
                    </p>
                    <div className="extraction-diff-grid">
                      <section aria-labelledby="extraction-caller-diff-title">
                        <h3 id="extraction-caller-diff-title">
                          Caller · {selectedDocumentReady.path}
                        </h3>
                        <pre>
                          {diffPreview(
                            extractionPreview.source,
                            extractionPreview.workflowSource,
                            Number.POSITIVE_INFINITY,
                          )}
                        </pre>
                      </section>
                      <section aria-labelledby="extraction-subflow-diff-title">
                        <h3 id="extraction-subflow-diff-title">
                          New subflow · {extractionPreview.subflowPath}
                        </h3>
                        <pre>
                          {diffPreview(
                            '',
                            extractionPreview.subflowSource,
                            Number.POSITIVE_INFINITY,
                          )}
                        </pre>
                      </section>
                    </div>
                    <details className="extraction-dependencies">
                      <summary>Dependency report</summary>
                      <div className="generic-grid">
                        {Object.entries(extractionPreview.dependencies).map(([label, items]) => (
                          <div key={label}>
                            <strong>{label}</strong>
                            <p>{items.length > 0 ? items.join(', ') : 'None detected'}</p>
                          </div>
                        ))}
                      </div>
                    </details>
                  </div>
                  <div className="context-actions">
                    <button
                      className="button button-secondary"
                      type="button"
                      onClick={() => setExtractionPreview(null)}
                      disabled={saving}
                    >
                      Cancel extraction
                    </button>
                    <button
                      className="button button-primary"
                      type="button"
                      onClick={() => void confirmSelectedExtraction()}
                      disabled={saving}
                    >
                      {saving ? 'Writing documents…' : 'Confirm extraction'}
                    </button>
                  </div>
                </div>
              )}
            {savePreview && selectedDocumentReady && currentDirty && (
              <div className="save-preview" role="dialog" aria-labelledby="save-preview-title">
                <div>
                  <p className="eyebrow">Review before save</p>
                  <h2 id="save-preview-title">Changes to {selectedDocumentReady.path}</h2>
                  <pre>
                    {diffPreview(baseContents[selectedDocumentReady.id] ?? '', currentDraft ?? '')}
                  </pre>
                  <p className="muted-copy">
                    Formatting removes trailing whitespace and ensures a final newline. Comments are
                    preserved by this source editor.
                  </p>
                  {formatWarning && (
                    <p className="issue-resolution" role="alert">
                      Formatting changed whitespace. Review the diff carefully before confirming.
                    </p>
                  )}
                </div>
                <div className="context-actions">
                  <button
                    className="button button-secondary"
                    type="button"
                    onClick={() => setSavePreview(false)}
                  >
                    Cancel
                  </button>
                  <button
                    className="button button-primary"
                    type="button"
                    onClick={() => void saveDraft()}
                    disabled={saving}
                  >
                    {saving ? 'Saving…' : 'Confirm save'}
                  </button>
                </div>
              </div>
            )}
            {conflict && selectedDocumentReady && (
              <div className="save-preview conflict-panel" role="alert">
                <div>
                  <p className="eyebrow">Optimistic concurrency conflict</p>
                  <h2>Someone changed {selectedDocumentReady.path}</h2>
                  <p className="muted-copy">
                    The server version is shown below. Compare it with your local draft, reload it,
                    or save your draft as a copy.
                  </p>
                  <pre>{diffPreview(conflict.server.content, conflict.local)}</pre>
                </div>
                <div className="context-actions">
                  <button
                    className="button button-secondary"
                    type="button"
                    onClick={() => {
                      setDrafts((items) => ({
                        ...items,
                        [selectedDocumentReady.id]: conflict.server.content,
                      }));
                      setBaseContents((items) => ({
                        ...items,
                        [selectedDocumentReady.id]: conflict.server.content,
                      }));
                      setDraftSourceTrees((items) => {
                        if (!Object.prototype.hasOwnProperty.call(items, selectedDocumentReady.id))
                          return items;
                        const next = { ...items };
                        delete next[selectedDocumentReady.id];
                        return next;
                      });
                      setActiveDocument(conflict.server);
                      setConflict(null);
                    }}
                  >
                    Reload server
                  </button>
                  <button
                    className="button button-secondary"
                    type="button"
                    onClick={() => void saveCopy()}
                  >
                    Save copy
                  </button>
                  <button className="button button-secondary" type="button" onClick={mergeConflict}>
                    Merge into draft
                  </button>
                  <button
                    className="button button-primary"
                    type="button"
                    onClick={() => setConflict(null)}
                  >
                    Keep local
                  </button>
                </div>
              </div>
            )}
            {deleteImpact && (
              <div
                className="save-preview delete-impact"
                role="dialog"
                aria-labelledby="delete-impact-title"
              >
                <div>
                  <p className="eyebrow">Dependency impact review</p>
                  <h2 id="delete-impact-title">Delete {deleteImpact.document.path}?</h2>
                  <p className="muted-copy">{deleteImpact.message}</p>
                  {deleteImpact.dependencies.length > 0 ? (
                    <>
                      <p className="muted-copy">
                        The following canonical documents reference this document and may become
                        invalid:
                      </p>
                      <ul className="delete-impact-list">
                        {deleteImpact.dependencies.map((dependency) => (
                          <li key={`${dependency.documentId}:${dependency.path}`}>
                            <code>{dependency.path}</code>
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : (
                    <p className="muted-copy">
                      The server reported dependent content, but did not return document paths.
                    </p>
                  )}
                </div>
                <div className="context-actions">
                  <button
                    className="button button-secondary"
                    type="button"
                    onClick={() => setDeleteImpact(null)}
                  >
                    Keep document
                  </button>
                  <button
                    className="button button-danger"
                    type="button"
                    onClick={() => void acceptDeleteImpact()}
                  >
                    Delete and accept impact
                  </button>
                </div>
              </div>
            )}
            <div className="view-tabs" role="tablist" aria-label="Document views">
              {views.map((item) => (
                <button
                  className={`view-tab ${view === item.id ? 'is-active' : ''}`}
                  type="button"
                  role="tab"
                  aria-selected={view === item.id}
                  key={item.id}
                  onClick={() => setView(item.id)}
                >
                  {item.label}
                  {view === item.id && <span className="sr-only"> selected</span>}
                </button>
              ))}
            </div>
            {selectedDocument ? (
              <>
                <SelectedDocumentPanel
                  summary={selectedDocument}
                  document={selectedDocumentProjection}
                  view={view}
                  error={documentError}
                  sourceLine={sourceLine}
                  documents={documents}
                  focusOperationId={focusOperationId}
                  draft={currentDraft}
                  dirty={currentDirty}
                  onDraftChange={updateDraft}
                  onSave={() => setSavePreview(true)}
                  onSaveAs={() => void saveCopy()}
                  onExport={exportDocument}
                  onFormat={() => {
                    const formatted = formatDraft(currentDraft ?? '');
                    if (formatted !== currentDraft) setFormatWarning(true);
                    updateDraft(formatted);
                  }}
                  onUndo={undoDraft}
                  onRedo={redoDraft}
                  canUndo={(histories[selectedDocument.id]?.past.length ?? 0) > 0}
                  canRedo={(histories[selectedDocument.id]?.future.length ?? 0) > 0}
                  saving={saving}
                  onOpenSource={(line) => {
                    if (line !== undefined) setSourceLine(line);
                    setView('source');
                  }}
                  onOpenForm={(stateName) => {
                    setFormStateName(stateName);
                    setView('form');
                  }}
                  onExtractRange={(stateNames) => void extractSelectedRange(stateNames)}
                  formStateName={formStateName}
                  onSelectDocument={selectDocument}
                  onSourceLine={(line) => {
                    setSourceLine(line);
                    setView('source');
                  }}
                />
                {selectedDocument.kind === 'workflow' && (
                  <ExecutionPanel key={selectedDocument.id} document={selectedDocument} />
                )}
              </>
            ) : (
              <section className="foundation-grid" aria-label="Studio status">
                <article className="foundation-card foundation-card-wide">
                  <div className="card-icon card-icon-blue" aria-hidden="true">
                    ⌘
                  </div>
                  <div>
                    <p className="eyebrow">Workspace editor and explorer</p>
                    <h2>One inventory, safe projections</h2>
                    <p>
                      Select a canonical document to inspect its stable ID, version, state types,
                      catalog references, diagnostics, and generated sync status.
                    </p>
                    <div className="token-row" aria-label="Explorer capabilities">
                      <span className="token token-state">Search</span>
                      <span className="token token-transition">Filter</span>
                      <span className="token token-operation">Deep link</span>
                      <span className="token token-event">Keyboard</span>
                    </div>
                  </div>
                </article>
                <article className="foundation-card">
                  <div className="card-icon card-icon-green" aria-hidden="true">
                    ✓
                  </div>
                  <p className="eyebrow">Protected boundary</p>
                  <h2>Canonical source first</h2>
                  <p>
                    Generated runner resources and deployment manifests are excluded from this
                    inventory.
                  </p>
                </article>
                <article className="foundation-card">
                  <div className="card-icon card-icon-amber" aria-hidden="true">
                    ◌
                  </div>
                  <p className="eyebrow">Next integration</p>
                  <h2>Source and metadata views</h2>
                  <p>
                    The selected document is ready for the STUDIO-103 source and metadata panels.
                  </p>
                </article>
              </section>
            )}
            {selectedDocumentReady &&
              currentDirty &&
              (draftDiagnostics[selectedDocumentReady.id]?.length ?? 0) > 0 && (
                <section className="diagnostic-panel draft-diagnostics" role="alert">
                  <h3>Draft diagnostics</h3>
                  <ul>
                    {draftDiagnostics[selectedDocumentReady.id]?.map((message) => (
                      <li key={message}>{message}</li>
                    ))}
                  </ul>
                </section>
              )}
            {issuesOpen && (
              <div id="issues-panel">
                <IssuesPanel
                  documents={validationDocuments ?? documents}
                  onSelectDocument={selectDocument}
                  onSelectView={setView}
                  onSourceLine={(line) => {
                    setSourceLine(line);
                    setView('source');
                  }}
                  onRunValidation={runValidationScope}
                  activeDocument={selectedDocumentReady}
                  activeSource={currentDraft}
                  onApplyQuickFix={(source, title) => {
                    if (!selectedDocumentReady) return;
                    updateDraft(source);
                    setView('source');
                    setNotice(`${title} applied to the draft. Review and save when ready.`);
                  }}
                />
              </div>
            )}
            <div className="notice" role="status" aria-live="polite">
              <span aria-hidden="true">ⓘ</span>
              <span>
                {notice === 'Loading canonical workspace documents.' && loadState === 'ready'
                  ? `Loaded ${total} canonical document${total === 1 ? '' : 's'}.`
                  : notice}
              </span>
              <button
                className="notice-close"
                type="button"
                aria-label="Dismiss notification"
                onClick={() => setNotice('')}
              >
                ×
              </button>
            </div>
          </main>
        </div>
      </div>
    </StudioErrorBoundary>
  );
}

function NavItem({
  label,
  icon,
  count,
  active,
  onClick,
}: {
  label: string;
  icon: string;
  count: number | null;
  active: boolean;
  onClick: () => void;
}): ReactNode {
  return (
    <a
      className={`nav-item ${active ? 'is-active' : ''}`}
      href="#"
      onClick={(event) => {
        event.preventDefault();
        onClick();
      }}
    >
      <span className="nav-icon" aria-hidden="true">
        {icon}
      </span>
      <span>{label}</span>
      {count !== null && <span className="nav-count">{count}</span>}
    </a>
  );
}
function uniqueOptions(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort((left, right) =>
    left.localeCompare(right, undefined, { numeric: true }),
  );
}
function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
function extractedSubflowPath(name: string, format: DocumentResponse['format']): string {
  const yamlPath = templatePath('subflow', name);
  return format === 'json' ? yamlPath.replace(/\.yaml$/, '.json') : yamlPath;
}
function groupDocuments(
  documents: DocumentSummary[],
): Array<{ key: string; kind: DocumentKind; directory: string; documents: DocumentSummary[] }> {
  const groups = new Map<
    string,
    { key: string; kind: DocumentKind; directory: string; documents: DocumentSummary[] }
  >();
  for (const document of documents) {
    const directory = documentDirectory(document.path);
    const key = `${document.kind}:${directory}`;
    const group = groups.get(key) ?? { key, kind: document.kind, directory, documents: [] };
    group.documents.push(document);
    groups.set(key, group);
  }
  return [...groups.values()].sort((left, right) => left.key.localeCompare(right.key));
}
