export type DocumentKind = 'workflow' | 'catalog';
export type ValidationState = 'valid' | 'parse-error' | 'unsupported';

export type GenerationStatus = {
  state: 'pending' | 'in_sync' | 'out_of_sync' | 'blocked' | 'disabled';
  message: string | null;
};

export type Diagnostic = {
  id: string;
  ruleId: string;
  phase: string;
  severity: 'error' | 'warning' | 'info' | 'hint';
  message: string;
  explanation: string | null;
  suggestedResolution: string | null;
  primaryRange: SourceRange | null;
  relatedRanges: Array<{ message: string | null; range: SourceRange }>;
  fieldPath: string | null;
  nodeId: string | null;
  provenance: string;
  documentationUrl: string | null;
  suppressible: boolean;
};

export type SourcePosition = { offset: number; line: number; column: number };
export type SourceRange = { start: SourcePosition; end: SourcePosition; encoding: string };

export type DocumentSummary = {
  id: string;
  kind: DocumentKind;
  path: string;
  displayName: string;
  format: 'yaml' | 'json';
  sizeBytes: number;
  etag: string;
  revisionNumber: number;
  modifiedAt: string;
  compatibility: 'editable' | 'partial' | 'source-readonly';
  specVersion: string | null;
  openapi: string | null;
  generation: GenerationStatus;
  diagnostics: Diagnostic[];
  documentVersion: string | null;
  name: string | null;
  workflowId?: string | null;
  stateTypes: string[];
  catalogAliases: string[];
  functionReferences: string[];
  catalogReferences: string[];
  subflowReferences: string[];
  reusableSubflow?: boolean;
  parseStatus: 'parsed' | 'error';
  validationState: ValidationState;
};

export type DocumentList = {
  items: DocumentSummary[];
  page: number;
  pageSize: number;
  total: number;
};

export type NamedItem = { name: string; detail: string | null };

export type DocumentMetadata = {
  workflowId: string | null;
  name: string | null;
  description: string | null;
  version: string | null;
  specVersion: string | null;
  openapi: string | null;
  start: string | null;
  timeouts: unknown;
  constants: unknown;
  annotations: unknown;
  extensions: unknown;
  functions: NamedItem[];
  events: NamedItem[];
  errors: NamedItem[];
  stateCounts: Record<string, number>;
  terminalStates: string[];
  subflowReferences: string[];
};

export type DocumentResponse = DocumentSummary & {
  content: string;
  metadata: DocumentMetadata | null;
  sourceTree: Record<string, unknown> | null;
};

export class WorkspaceApiError extends Error {
  public readonly status: number;
  public readonly code: string | null;
  public readonly details: Record<string, unknown>;

  public constructor(
    status: number,
    message: string,
    options: { code?: string | null; details?: Record<string, unknown> } = {},
  ) {
    super(message);
    this.name = 'WorkspaceApiError';
    this.status = status;
    this.code = options.code ?? null;
    this.details = options.details ?? {};
  }
}

export type CreateDocumentRequest = {
  kind: DocumentKind;
  path: string;
  format: 'yaml' | 'json';
  content: string;
};

export type ValidationResponse = {
  valid: boolean;
  diagnostics: Diagnostic[];
  etag: string;
  compatibility: DocumentSummary['compatibility'];
  sourceTree: Record<string, unknown> | null;
};

export type ValidationScope = 'document' | 'dependencies' | 'workspace';

export type ValidationReport = {
  scope: ValidationScope;
  valid: boolean;
  documentsChecked: number;
  documents: Array<{
    id: string;
    kind: DocumentKind;
    path: string;
    etag: string;
    valid: boolean;
    diagnostics: Diagnostic[];
  }>;
  diagnostics: Diagnostic[];
};

export type RenameResponse = {
  document: DocumentResponse;
  previousId: string;
  previousPath: string;
};

export type TrashReceipt = {
  trashId: string;
  originalPath: string;
  originalEtag: string;
  deletedAt: string;
  expiresAt: string;
  generation: GenerationStatus;
};

async function responseError(response: Response, fallback: string): Promise<WorkspaceApiError> {
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // Some proxies return an empty response for errors.
  }
  const problem = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const details = Object.fromEntries(
    Object.entries(problem).filter(
      ([key]) => !['type', 'title', 'status', 'code', 'detail'].includes(key),
    ),
  );
  return new WorkspaceApiError(
    response.status,
    typeof problem.detail === 'string' ? problem.detail : fallback,
    { code: typeof problem.code === 'string' ? problem.code : null, details },
  );
}

async function requestJson<T>(
  input: RequestInfo | URL,
  init: RequestInit,
  fallback: string,
): Promise<T> {
  const response = await fetch(input, init);
  if (!response.ok) throw await responseError(response, fallback);
  return (await response.json()) as T;
}

export async function fetchDocuments(signal?: AbortSignal): Promise<DocumentList> {
  const init: RequestInit = { headers: { Accept: 'application/json' } };
  if (signal) init.signal = signal;
  const response = await fetch(
    '/api/studio/v1/documents?includeDiagnostics=true&page=1&pageSize=200',
    init,
  );
  if (!response.ok) {
    throw await responseError(response, `Workspace API returned HTTP ${response.status}`);
  }
  return (await response.json()) as DocumentList;
}

export async function fetchDocument(
  document: DocumentSummary,
  signal?: AbortSignal,
): Promise<DocumentResponse> {
  const init: RequestInit = { headers: { Accept: 'application/json' } };
  if (signal) init.signal = signal;
  const response = await fetch(
    `/api/studio/v1/documents/${document.kind}/${encodeURIComponent(document.id)}`,
    init,
  );
  if (!response.ok) {
    throw await responseError(response, `Document API returned HTTP ${response.status}`);
  }
  const body = (await response.json()) as DocumentResponse & { summary?: DocumentSummary };
  // Keep compatibility with servers that have not yet enabled JsonUnwrapped on the response.
  return body.summary ? { ...body.summary, ...body } : body;
}

export async function createDocument(request: CreateDocumentRequest): Promise<DocumentResponse> {
  return requestJson<DocumentResponse>(
    '/api/studio/v1/documents',
    {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    },
    'The document could not be created.',
  );
}

export async function updateDocument(
  document: DocumentSummary,
  content: string,
  ifMatch: string,
): Promise<DocumentResponse> {
  return requestJson<DocumentResponse>(
    `/api/studio/v1/documents/${document.kind}/${encodeURIComponent(document.id)}`,
    {
      method: 'PUT',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'If-Match': ifMatch,
      },
      body: JSON.stringify({ content, format: document.format }),
    },
    'The document could not be saved.',
  );
}

export async function validateDocument(
  document: DocumentSummary,
  content: string,
): Promise<ValidationResponse> {
  return requestJson<ValidationResponse>(
    `/api/studio/v1/documents/${document.kind}/${encodeURIComponent(document.id)}/validate`,
    {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, format: document.format }),
    },
    'The draft could not be validated.',
  );
}

export async function validateScope(
  scope: ValidationScope,
  document?: DocumentSummary | null,
  content?: string | null,
): Promise<ValidationReport> {
  return requestJson<ValidationReport>(
    '/api/studio/v1/documents/validate',
    {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scope,
        ...(document
          ? { kind: document.kind, documentId: document.id, format: document.format }
          : {}),
        ...(content !== undefined && content !== null ? { content } : {}),
      }),
    },
    'The selected validation scope could not be evaluated.',
  );
}

export async function renameDocument(
  document: DocumentSummary,
  path: string,
  ifMatch: string,
): Promise<RenameResponse> {
  return requestJson<RenameResponse>(
    `/api/studio/v1/documents/${document.kind}/${encodeURIComponent(document.id)}/rename`,
    {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'If-Match': ifMatch,
      },
      body: JSON.stringify({ path }),
    },
    'The document could not be renamed.',
  );
}

export async function deleteDocument(
  document: DocumentSummary,
  ifMatch: string,
  acceptDependencyImpact = false,
): Promise<TrashReceipt> {
  return requestJson<TrashReceipt>(
    `/api/studio/v1/documents/${document.kind}/${encodeURIComponent(document.id)}?acceptDependencyImpact=${String(acceptDependencyImpact)}`,
    {
      method: 'DELETE',
      headers: { Accept: 'application/json', 'If-Match': ifMatch },
    },
    'The document could not be deleted.',
  );
}

export function documentHref(document: DocumentSummary): string {
  const collection = document.kind === 'catalog' ? 'catalogs' : 'workflows';
  return `/studio/${collection}/${encodeURIComponent(document.id)}`;
}

export function documentIdFromLocation(
  location: Pick<Location, 'pathname'> = window.location,
): string | null {
  const match = location.pathname.match(/^\/studio\/(?:workflows|catalogs)\/([^/]+)\/?$/);
  if (!match?.[1]) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

export function documentDirectory(path: string): string {
  const separator = path.lastIndexOf('/');
  return separator < 0 ? 'workspace' : path.slice(0, separator);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}

export function formatModifiedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return 'Unknown time';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
    date,
  );
}

export function displayDocumentName(document: DocumentSummary): string {
  return document.name?.trim() || document.displayName;
}

export function documentMatches(
  document: DocumentSummary,
  filters: {
    query: string;
    kind: 'all' | DocumentKind;
    version: string;
    stateType: string;
    catalog: string;
    validation: 'all' | ValidationState;
    reusableSubflow?: boolean;
  },
): boolean {
  if (filters.kind !== 'all' && document.kind !== filters.kind) return false;
  if (
    filters.reusableSubflow &&
    document.kind !== 'workflow' &&
    !document.path.includes('/sub_flows/')
  ) {
    return false;
  }
  if (
    filters.reusableSubflow &&
    document.kind === 'workflow' &&
    document.reusableSubflow !== true &&
    !document.path.includes('/sub_flows/')
  ) {
    return false;
  }
  if (
    filters.version !== 'all' &&
    (document.specVersion ?? document.openapi ?? 'unknown') !== filters.version
  ) {
    return false;
  }
  if (filters.stateType !== 'all' && !document.stateTypes.includes(filters.stateType)) return false;
  if (filters.catalog !== 'all' && !document.catalogAliases.includes(filters.catalog)) return false;
  if (filters.validation !== 'all' && document.validationState !== filters.validation) return false;
  const query = filters.query.trim().toLowerCase();
  if (!query) return true;
  return [
    document.displayName,
    document.name,
    document.id,
    document.path,
    document.documentVersion,
    document.specVersion,
    document.openapi,
    ...document.stateTypes,
    ...document.catalogAliases,
  ]
    .filter((value): value is string => Boolean(value))
    .some((value) => value.toLowerCase().includes(query));
}
