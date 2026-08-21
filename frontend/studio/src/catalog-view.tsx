import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import {
  addCatalogComponent,
  addCatalogOperation,
  catalogComponentNamesFromSource,
  catalogComponentText,
  catalogOperationStructuredText,
  catalogOperationsFromSource,
  catalogMetadataFromSource,
  catalogServersText,
  patchCatalogOperation,
  patchCatalogOperationStructured,
  patchCatalogComponent,
  patchCatalogMetadata,
  patchCatalogServers,
  removeCatalogOperation,
  type CatalogOperationField,
  type CatalogOperationStructuredField,
  type CatalogComponentType,
  type CatalogMetadataField,
  type CatalogOperation as CatalogPatchOperation,
} from './catalog-patch';
import { operationPayloadPreviews, type CatalogPayloadPreview } from './catalog-preview';
import { GenericDetails } from './document-view';
import type { DocumentResponse, DocumentSummary } from './workspace';

const catalogMetadataFields: Array<{
  key: CatalogMetadataField;
  label: string;
  help: string;
  required?: boolean;
}> = [
  { key: 'title', label: 'Catalog title', help: 'Human-readable API title.', required: true },
  {
    key: 'version',
    label: 'Catalog version',
    help: 'Version of the described API.',
    required: true,
  },
  { key: 'description', label: 'Description', help: 'Optional service description.' },
];

export function CatalogEditor({
  document,
  source,
  onChange,
  onSave,
  onOpenSource,
  dirty,
  saving,
  documents = [],
}: {
  document: DocumentResponse;
  source: string;
  onChange: (source: string) => void;
  onSave: () => void;
  onOpenSource: (line?: number) => void;
  dirty: boolean;
  saving: boolean;
  documents?: DocumentSummary[];
}): ReactNode {
  const serverSourceRef = useRef(source);
  const [servers, setServers] = useState(() => catalogServersText(document, source));
  const [serverError, setServerError] = useState('');
  useEffect(() => {
    if (serverSourceRef.current === source) return;
    serverSourceRef.current = source;
    setServers(catalogServersText(document, source));
    setServerError('');
  }, [document, source]);
  const metadata = Object.fromEntries(
    catalogMetadataFields.map(({ key }) => [key, catalogMetadataFromSource(document, source, key)]),
  ) as Record<CatalogMetadataField, string>;
  const missingRequired = catalogMetadataFields.some(
    ({ key, required }) => required && !metadata[key],
  );
  const operations = useMemo(
    () => catalogOperationsFromSource(document, source),
    [document, source],
  );
  const [selectedOperationKey, setSelectedOperationKey] = useState('');
  const [operationError, setOperationError] = useState('');
  const [operationImpact, setOperationImpact] = useState<{
    operation: CatalogPatchOperation;
    references: DocumentSummary[];
  } | null>(null);
  const [structuredError, setStructuredError] = useState('');
  const [componentType, setComponentType] = useState<CatalogComponentType>('schemas');
  const [selectedComponentName, setSelectedComponentName] = useState('');
  const [componentError, setComponentError] = useState('');
  const [addComponentOpen, setAddComponentOpen] = useState(false);
  const [newComponent, setNewComponent] = useState({ name: '', text: '{}' });
  const [addOperationOpen, setAddOperationOpen] = useState(false);
  const [newOperation, setNewOperation] = useState({
    path: '/new-operation',
    method: 'get',
    operationId: '',
    summary: '',
    description: '',
  });
  const operationKey = (path: string, method: string) => `${method.toLowerCase()} ${path}`;
  const selectedOperation =
    operations.find(
      (operation) => operationKey(operation.path, operation.method) === selectedOperationKey,
    ) ??
    operations[0] ??
    null;
  const selectedOperationKeyValue = selectedOperation
    ? operationKey(selectedOperation.path, selectedOperation.method)
    : '';
  const operationReferences = selectedOperation?.operationId
    ? documents.filter(
        (candidate) =>
          candidate.kind === 'workflow' &&
          candidate.functionReferences.some((reference) =>
            reference.endsWith(`#${selectedOperation.operationId}`),
          ),
      )
    : [];
  const catalogRoot = record(document.sourceTree);
  const selectedOperationTree = operationTree(catalogRoot, selectedOperation);
  const componentNames = useMemo(
    () => catalogComponentNamesFromSource(document, source, componentType),
    [componentType, document, source],
  );
  const activeComponentName = componentNames.includes(selectedComponentName)
    ? selectedComponentName
    : (componentNames[0] ?? '');

  const updateMetadata = (key: CatalogMetadataField, value: string) => {
    onChange(patchCatalogMetadata(source, document.format, key, value).source);
  };
  const updateServers = (value: string) => {
    setServers(value);
    const result = patchCatalogServers(source, document.format, value);
    setServerError(result.error ?? '');
    if (!result.error) onChange(result.source);
  };
  const updateOperation = (field: CatalogOperationField, value: string) => {
    if (!selectedOperation) return;
    setStructuredError('');
    if (
      field === 'operationId' &&
      value.trim() &&
      operations.some(
        (operation) =>
          operation.operationId === value.trim() &&
          operationKey(operation.path, operation.method) !== selectedOperationKey,
      )
    ) {
      setOperationError(`operationId "${value.trim()}" is already used.`);
      return;
    }
    const result = patchCatalogOperation(source, document.format, selectedOperation, field, value);
    setOperationError(result.error ?? '');
    if (!result.error) onChange(result.source);
  };
  const createComponent = () => {
    const result = addCatalogComponent(
      source,
      document.format,
      componentType,
      newComponent.name,
      newComponent.text,
    );
    setComponentError(result.error ?? '');
    if (!result.error) {
      onChange(result.source);
      setAddComponentOpen(false);
      setNewComponent({ name: '', text: '{}' });
    }
  };
  const createOperation = () => {
    const duplicate = operations.some(
      (operation) => operation.operationId === newOperation.operationId.trim(),
    );
    if (duplicate) {
      setOperationError(`operationId "${newOperation.operationId.trim()}" is already used.`);
      return;
    }
    const result = addCatalogOperation(source, document.format, newOperation);
    setOperationError(result.error ?? '');
    if (!result.error) {
      onChange(result.source);
      setAddOperationOpen(false);
      setNewOperation({
        path: '/new-operation',
        method: 'get',
        operationId: '',
        summary: '',
        description: '',
      });
    }
  };
  const deleteOperation = (acceptImpact = false) => {
    if (!selectedOperation) return;
    if (!acceptImpact && operationReferences.length > 0) {
      setOperationImpact({ operation: selectedOperation, references: operationReferences });
      return;
    }
    const result = removeCatalogOperation(source, document.format, selectedOperation);
    setOperationError(result.error ?? '');
    if (!result.error) {
      onChange(result.source);
      setSelectedOperationKey('');
      setOperationImpact(null);
    }
  };

  return (
    <form
      className="metadata-editor"
      onSubmit={(event) => event.preventDefault()}
      aria-labelledby="catalog-editor-title"
    >
      <div className="metadata-heading">
        <div>
          <p className="eyebrow">OpenAPI catalog · source-preserving draft</p>
          <h2 id="catalog-editor-title">Catalog authoring</h2>
          <p>Edit supported catalog metadata and servers while retaining unknown fields.</p>
        </div>
        <div className="context-actions">
          <button className="button button-secondary" type="button" onClick={() => onOpenSource()}>
            Open source
          </button>
          <button
            className="button button-primary"
            type="button"
            onClick={onSave}
            disabled={
              !dirty ||
              saving ||
              Boolean(serverError) ||
              Boolean(operationError) ||
              Boolean(structuredError) ||
              Boolean(componentError) ||
              missingRequired
            }
          >
            {saving ? 'Saving…' : 'Save catalog draft'}
          </button>
        </div>
      </div>
      <div className="form-notice" role="note">
        <strong>OpenAPI {document.openapi ?? '3.x'}</strong>
        <span>
          Paths, operations, and reusable components remain available in Details and Source.
        </span>
      </div>
      <div className="metadata-form-grid">
        {catalogMetadataFields.map(({ key, label, help, required }) => (
          <label className="metadata-form-field" key={key}>
            <span>{label}</span>
            {key === 'description' ? (
              <textarea
                value={metadata[key]}
                required={required}
                rows={4}
                onChange={(event) => updateMetadata(key, event.target.value)}
                aria-label={label}
              />
            ) : (
              <input
                value={metadata[key]}
                required={required}
                onChange={(event) => updateMetadata(key, event.target.value)}
                aria-label={label}
              />
            )}
            <small>{help}</small>
            {required && !metadata[key] && (
              <small className="field-error">This field cannot be empty.</small>
            )}
          </label>
        ))}
      </div>
      <div className="metadata-section">
        <h3>Servers</h3>
        <p className="muted-copy">
          Enter a JSON array of OpenAPI server objects. Other source fields remain untouched.
        </p>
        <label className="metadata-form-field">
          <span>Servers (JSON array)</span>
          <textarea
            value={servers}
            rows={8}
            onChange={(event) => updateServers(event.target.value)}
            aria-label="Servers (JSON array)"
            aria-describedby="catalog-servers-help catalog-servers-error"
          />
          <small id="catalog-servers-help">
            Each object normally includes a url and optional description.
          </small>
          {serverError && (
            <small className="field-error" id="catalog-servers-error">
              {serverError}
            </small>
          )}
        </label>
      </div>
      <div className="metadata-section">
        <div className="metadata-section-heading">
          <div>
            <h3>Paths and operations</h3>
            <p className="muted-copy">
              Edit callable operation metadata while preserving parameters, request bodies,
              responses, and extensions.
            </p>
          </div>
          <button
            className="button button-secondary"
            type="button"
            onClick={() => setAddOperationOpen((open) => !open)}
          >
            {addOperationOpen ? 'Cancel new operation' : 'Add operation'}
          </button>
        </div>
        {addOperationOpen && (
          <div className="metadata-form-grid catalog-operation-create" aria-label="New operation">
            <label className="metadata-form-field">
              <span>Path</span>
              <input
                value={newOperation.path}
                aria-label="New operation path"
                onChange={(event) =>
                  setNewOperation((item) => ({ ...item, path: event.target.value }))
                }
              />
            </label>
            <label className="metadata-form-field">
              <span>Method</span>
              <select
                value={newOperation.method}
                aria-label="New operation method"
                onChange={(event) =>
                  setNewOperation((item) => ({ ...item, method: event.target.value }))
                }
              >
                {['get', 'post', 'put', 'patch', 'delete', 'options', 'head', 'trace'].map(
                  (method) => (
                    <option key={method} value={method}>
                      {method.toUpperCase()}
                    </option>
                  ),
                )}
              </select>
            </label>
            <label className="metadata-form-field">
              <span>Operation ID</span>
              <input
                value={newOperation.operationId}
                aria-label="New operation ID"
                onChange={(event) =>
                  setNewOperation((item) => ({ ...item, operationId: event.target.value }))
                }
              />
            </label>
            <label className="metadata-form-field">
              <span>Summary</span>
              <input
                value={newOperation.summary}
                aria-label="New operation summary"
                onChange={(event) =>
                  setNewOperation((item) => ({ ...item, summary: event.target.value }))
                }
              />
            </label>
            <button className="button button-primary" type="button" onClick={createOperation}>
              Create operation
            </button>
          </div>
        )}
        {operations.length === 0 ? (
          <p className="muted-copy">No HTTP operations declared yet.</p>
        ) : (
          <>
            <label className="metadata-form-field">
              <span>Selected operation</span>
              <select
                value={
                  selectedOperation
                    ? operationKey(selectedOperation.path, selectedOperation.method)
                    : ''
                }
                aria-label="Selected operation"
                onChange={(event) => {
                  setSelectedOperationKey(event.target.value);
                  setOperationError('');
                  setStructuredError('');
                }}
              >
                {operations.map((operation) => (
                  <option
                    key={operationKey(operation.path, operation.method)}
                    value={operationKey(operation.path, operation.method)}
                  >
                    {operation.method.toUpperCase()} {operation.path}
                    {operation.operationId ? ` · ${operation.operationId}` : ''}
                  </option>
                ))}
              </select>
            </label>
            {selectedOperation && (
              <div className="metadata-form-grid">
                <label className="metadata-form-field">
                  <span>Operation ID</span>
                  <input
                    value={selectedOperation.operationId}
                    aria-label="Operation ID"
                    onChange={(event) => updateOperation('operationId', event.target.value)}
                  />
                </label>
                <label className="metadata-form-field">
                  <span>Summary</span>
                  <input
                    value={selectedOperation.summary}
                    aria-label="Operation summary"
                    onChange={(event) => updateOperation('summary', event.target.value)}
                  />
                </label>
                <label className="metadata-form-field">
                  <span>Description</span>
                  <textarea
                    value={selectedOperation.description}
                    rows={4}
                    aria-label="Operation description"
                    onChange={(event) => updateOperation('description', event.target.value)}
                  />
                </label>
                <div className="catalog-inline-actions">
                  <button
                    className="button button-danger"
                    type="button"
                    onClick={() => deleteOperation()}
                  >
                    Delete operation
                  </button>
                </div>
                <CatalogStructuredFields
                  key={`${selectedOperationKeyValue}:${source}`}
                  document={document}
                  source={source}
                  operation={selectedOperation}
                  onChange={onChange}
                  onError={setStructuredError}
                />
                <CatalogPayloadPreviews
                  key={`${selectedOperationKeyValue}:${document.id}`}
                  root={catalogRoot}
                  operation={selectedOperationTree}
                  editable
                />
              </div>
            )}
          </>
        )}
        {operationImpact && (
          <div
            className="catalog-inline-impact"
            role="dialog"
            aria-labelledby="operation-impact-title"
          >
            <p className="eyebrow">Dependency impact review</p>
            <h4 id="operation-impact-title">Operation dependency impact</h4>
            <p>
              Deleting <code>{operationImpact.operation.operationId}</code> will leave these
              workflow function references unresolved:
            </p>
            <ul className="delete-impact-list">
              {operationImpact.references.map((reference) => (
                <li key={reference.id}>
                  <code>{reference.path}</code>
                </li>
              ))}
            </ul>
            <div className="context-actions">
              <button
                className="button button-secondary"
                type="button"
                onClick={() => setOperationImpact(null)}
              >
                Keep operation
              </button>
              <button
                className="button button-danger"
                type="button"
                onClick={() => deleteOperation(true)}
              >
                Delete operation and accept impact
              </button>
            </div>
          </div>
        )}
        {operationError && (
          <p className="field-error" role="alert">
            {operationError}
          </p>
        )}
        {structuredError && (
          <p className="field-error" role="alert">
            {structuredError}
          </p>
        )}
      </div>
      <div className="metadata-section">
        <div className="metadata-section-heading">
          <div>
            <h3>Reusable components</h3>
            <p className="muted-copy">
              Edit schema and security-scheme fragments without rewriting other component
              definitions.
            </p>
          </div>
          <button
            className="button button-secondary"
            type="button"
            onClick={() => setAddComponentOpen((open) => !open)}
          >
            {addComponentOpen ? 'Cancel new component' : 'Add component'}
          </button>
        </div>
        <label className="metadata-form-field">
          <span>Component type</span>
          <select
            value={componentType}
            aria-label="Component type"
            onChange={(event) => {
              setComponentType(event.target.value as CatalogComponentType);
              setComponentError('');
            }}
          >
            <option value="schemas">Schemas</option>
            <option value="responses">Responses</option>
            <option value="parameters">Parameters</option>
            <option value="examples">Examples</option>
            <option value="requestBodies">Request bodies</option>
            <option value="headers">Headers</option>
            <option value="securitySchemes">Security schemes</option>
            <option value="links">Links</option>
            <option value="callbacks">Callbacks</option>
          </select>
        </label>
        {addComponentOpen && (
          <div className="metadata-form-grid catalog-component-create" aria-label="New component">
            <label className="metadata-form-field">
              <span>Component name</span>
              <input
                value={newComponent.name}
                aria-label="New component name"
                onChange={(event) =>
                  setNewComponent((item) => ({ ...item, name: event.target.value }))
                }
              />
            </label>
            <label className="metadata-form-field">
              <span>Definition (YAML or JSON)</span>
              <textarea
                value={newComponent.text}
                rows={6}
                aria-label="New component definition (YAML or JSON)"
                onChange={(event) =>
                  setNewComponent((item) => ({ ...item, text: event.target.value }))
                }
              />
            </label>
            <button className="button button-primary" type="button" onClick={createComponent}>
              Create component
            </button>
          </div>
        )}
        {activeComponentName ? (
          <>
            <label className="metadata-form-field">
              <span>Selected component</span>
              <select
                value={activeComponentName}
                aria-label="Selected component"
                onChange={(event) => {
                  setSelectedComponentName(event.target.value);
                  setComponentError('');
                }}
              >
                {componentNames.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <CatalogComponentFields
              key={`${componentType}:${activeComponentName}:${source}`}
              document={document}
              source={source}
              type={componentType}
              name={activeComponentName}
              onChange={onChange}
              onError={setComponentError}
            />
          </>
        ) : (
          <p className="muted-copy">No {componentType} components declared yet.</p>
        )}
        {componentError && (
          <p className="field-error" role="alert">
            {componentError}
          </p>
        )}
      </div>
    </form>
  );
}

function CatalogStructuredFields({
  document,
  source,
  operation,
  onChange,
  onError,
}: {
  document: DocumentResponse;
  source: string;
  operation: { path: string; method: string };
  onChange: (source: string) => void;
  onError: (error: string) => void;
}): ReactNode {
  const [values, setValues] = useState<Record<CatalogOperationStructuredField, string>>(() => ({
    parameters: catalogOperationStructuredText(document, source, operation, 'parameters'),
    requestBody: catalogOperationStructuredText(document, source, operation, 'requestBody'),
    responses: catalogOperationStructuredText(document, source, operation, 'responses'),
  }));
  const update = (field: CatalogOperationStructuredField, value: string) => {
    setValues((items) => ({ ...items, [field]: value }));
    const result = patchCatalogOperationStructured(
      source,
      document.format,
      operation,
      field,
      value,
    );
    onError(result.error ?? '');
    if (!result.error) onChange(result.source);
  };
  return (
    <>
      {(
        [
          ['parameters', 'Parameters', 'A YAML fragment or JSON array of parameter objects.'],
          ['requestBody', 'Request body', 'A YAML fragment or JSON object for the request body.'],
          ['responses', 'Responses', 'A YAML fragment or JSON object keyed by status code.'],
        ] as Array<[CatalogOperationStructuredField, string, string]>
      ).map(([field, label, help]) => (
        <label className="metadata-form-field" key={field}>
          <span>{label}</span>
          <textarea
            value={values[field]}
            rows={field === 'responses' ? 10 : 7}
            aria-label={`${label} (YAML or JSON)`}
            onChange={(event) => update(field, event.target.value)}
          />
          <small>{help}</small>
        </label>
      ))}
    </>
  );
}

function CatalogPayloadPreviews({
  root,
  operation,
  editable,
}: {
  root: Record<string, unknown> | null;
  operation: Record<string, unknown> | null;
  editable: boolean;
}): ReactNode {
  const previews = useMemo(() => operationPayloadPreviews(root, operation), [operation, root]);
  const previewItems = useMemo(
    () => [
      ...(previews.request
        ? [{ key: 'request', label: 'Request body', preview: previews.request }]
        : []),
      ...previews.responses.map((preview) => ({
        key: `response-${preview.status}`,
        label: `Response ${preview.status}`,
        preview,
      })),
    ],
    [previews],
  );
  const [examples, setExamples] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      previewItems.map(({ key, preview }) => [key, formatExample(preview.example)]),
    ),
  );
  if (previewItems.length === 0) return null;
  return (
    <section className="catalog-payload-previews" aria-label="Schema previews and examples">
      <div className="metadata-section-heading">
        <div>
          <h4>Schema previews and examples</h4>
          <p className="muted-copy">
            Local references are resolved for preview only. Examples are editable in this draft view
            and are not written to the canonical catalog until you add them to the source.
          </p>
        </div>
      </div>
      <div className="catalog-preview-grid">
        {previewItems.map(({ key, label, preview }) => (
          <CatalogPayloadPreviewCard
            key={key}
            label={label}
            preview={preview}
            value={examples[key] ?? ''}
            editable={editable}
            onChange={(value) => setExamples((current) => ({ ...current, [key]: value }))}
            onRegenerate={() =>
              setExamples((current) => ({ ...current, [key]: formatExample(preview.example) }))
            }
          />
        ))}
      </div>
    </section>
  );
}

function CatalogPayloadPreviewCard({
  label,
  preview,
  value,
  editable,
  onChange,
  onRegenerate,
}: {
  label: string;
  preview: CatalogPayloadPreview;
  value: string;
  editable: boolean;
  onChange: (value: string) => void;
  onRegenerate: () => void;
}): ReactNode {
  return (
    <article className="catalog-preview-card">
      <h5>{label}</h5>
      <p className="muted-copy">
        <strong>Schema:</strong> {preview.schemaLabel}
        {preview.mediaType && <span> · {preview.mediaType}</span>}
      </p>
      {preview.description && <p className="muted-copy">{preview.description}</p>}
      <details>
        <summary>View schema</summary>
        <pre>
          {preview.schema ? JSON.stringify(preview.schema, null, 2) : 'No schema declared.'}
        </pre>
      </details>
      <label className="metadata-form-field">
        <span>Editable {label.toLowerCase()} example</span>
        <textarea
          value={value}
          rows={8}
          readOnly={!editable}
          aria-label={`Editable ${label.toLowerCase()} example`}
          onChange={(event) => onChange(event.target.value)}
        />
      </label>
      {editable && (
        <button className="button button-secondary" type="button" onClick={onRegenerate}>
          Regenerate example
        </button>
      )}
      <small className="muted-copy">
        {preview.exampleSource === 'explicit'
          ? 'Example comes from the catalog source.'
          : preview.exampleSource === 'generated'
            ? 'Example generated from the local schema.'
            : 'No example could be generated from this schema.'}
      </small>
    </article>
  );
}

function CatalogComponentFields({
  document,
  source,
  type,
  name,
  onChange,
  onError,
}: {
  document: DocumentResponse;
  source: string;
  type: CatalogComponentType;
  name: string;
  onChange: (source: string) => void;
  onError: (error: string) => void;
}): ReactNode {
  const [value, setValue] = useState(() => catalogComponentText(document, source, type, name));
  const update = (text: string) => {
    setValue(text);
    const result = patchCatalogComponent(source, document.format, type, name, text);
    onError(result.error ?? '');
    if (!result.error) onChange(result.source);
  };
  return (
    <label className="metadata-form-field">
      <span>Component definition (YAML or JSON)</span>
      <textarea
        value={value}
        rows={12}
        aria-label="Component definition (YAML or JSON)"
        onChange={(event) => update(event.target.value)}
      />
      <small>
        Object definitions are validated for JSON catalogs; YAML fragments retain their structure.
      </small>
    </label>
  );
}

type CatalogViewProps = {
  document: DocumentResponse;
  documents: DocumentSummary[];
  focusOperationId: string | null;
  onSourceLine: (line: number) => void;
  onSelectDocument: (document: DocumentSummary, operationId?: string) => void;
};

type CatalogOperation = {
  path: string;
  method: string;
  operationId: string | null;
  summary: string | null;
  description: string | null;
  parameters: Array<Record<string, unknown>>;
  requestBody: Record<string, unknown> | null;
  responses: Record<string, unknown>;
  callbacks: Record<string, unknown>;
  security: unknown;
  sourceLine: number | null;
};

type CatalogModel = {
  root: Record<string, unknown> | null;
  title: string;
  version: string;
  description: string | null;
  servers: Array<Record<string, unknown>>;
  operations: CatalogOperation[];
  schemas: Record<string, unknown>;
  securitySchemes: Record<string, unknown>;
  refs: string[];
  unresolvedRefs: string[];
};

export function CatalogView({
  document,
  documents,
  focusOperationId,
  onSourceLine,
  onSelectDocument,
}: CatalogViewProps): ReactNode {
  const catalog = useMemo(() => parseCatalog(document), [document]);
  const operationReferences = (operationId: string | null) =>
    operationId
      ? documents.filter(
          (candidate) =>
            candidate.kind === 'workflow' &&
            candidate.functionReferences.some((reference) => reference.endsWith(`#${operationId}`)),
        )
      : [];
  return (
    <section className="catalog-view metadata-view" aria-labelledby="catalog-title">
      <div className="metadata-heading">
        <div>
          <p className="eyebrow">OpenAPI catalog · read-only projection</p>
          <h2 id="catalog-title">{catalog.title || document.displayName}</h2>
          <p>{catalog.description ?? 'No service description provided.'}</p>
        </div>
        <span className="badge badge-info">OpenAPI {document.openapi ?? 'unknown'}</span>
      </div>
      <div className="catalog-service-grid">
        <div>
          <span>Document</span>
          <strong>{document.path}</strong>
        </div>
        <div>
          <span>Version</span>
          <strong>{catalog.version || document.documentVersion || '—'}</strong>
        </div>
        <div>
          <span>Operations</span>
          <strong>{catalog.operations.length}</strong>
        </div>
        <div>
          <span>Schemas</span>
          <strong>{Object.keys(catalog.schemas).length}</strong>
        </div>
      </div>
      <div className="metadata-section">
        <h3>Servers</h3>
        {catalog.servers.length === 0 ? (
          <p className="muted-copy">
            No servers declared; the catalog uses its relative/default endpoint context.
          </p>
        ) : (
          <ul className="catalog-server-list">
            {catalog.servers.map((server, index) => (
              <li key={`${String(server.url)}-${index}`}>
                <code>{String(server.url ?? '—')}</code>
                {typeof server.description === 'string' && <span>{server.description}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="metadata-section">
        <h3>Paths and operations</h3>
        <div className="catalog-operation-list">
          {catalog.operations.length === 0 ? (
            <p className="muted-copy">No HTTP operations were detected.</p>
          ) : (
            catalog.operations.map((operation) => {
              const references = operationReferences(operation.operationId);
              const focused = operation.operationId === focusOperationId;
              return (
                <details
                  className={`catalog-operation ${focused ? 'is-focused' : ''}`}
                  open={focused}
                  key={`${operation.method}:${operation.path}`}
                >
                  <summary>
                    <span className={`http-method method-${operation.method}`}>
                      {operation.method.toUpperCase()}
                    </span>
                    <code>{operation.path}</code>
                    <strong>{operation.operationId ?? 'Unnamed operation'}</strong>
                  </summary>
                  <div className="catalog-operation-body">
                    {operation.summary && (
                      <p>
                        <strong>{operation.summary}</strong>
                      </p>
                    )}
                    {operation.description && <p className="muted-copy">{operation.description}</p>}
                    <CatalogField label="Parameters" value={operation.parameters} />
                    <CatalogField label="Request body" value={operation.requestBody} />
                    <CatalogField label="Responses" value={operation.responses} />
                    <CatalogPayloadPreviews
                      key={`${operation.method}:${operation.path}`}
                      root={catalog.root}
                      operation={operationTree(catalog.root, operation)}
                      editable={false}
                    />
                    <CatalogField label="Callbacks" value={operation.callbacks} />
                    <CatalogField label="Security" value={operation.security} />
                    <div className="catalog-operation-footer">
                      {operation.sourceLine && (
                        <SourceLineButton line={operation.sourceLine} onSourceLine={onSourceLine} />
                      )}
                      {references.length > 0 ? (
                        <div className="catalog-references">
                          <strong>Referenced by</strong>
                          {references.map((reference) => (
                            <button
                              type="button"
                              key={reference.id}
                              onClick={() =>
                                onSelectDocument(reference, operation.operationId ?? undefined)
                              }
                            >
                              {reference.name ?? reference.displayName}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <span className="muted-copy">No local workflow reference detected.</span>
                      )}
                    </div>
                  </div>
                </details>
              );
            })
          )}
        </div>
      </div>
      <div className="metadata-section">
        <h3>Component schemas and security</h3>
        <div className="catalog-components-grid">
          <div>
            <h4>Schemas</h4>
            {Object.keys(catalog.schemas).length === 0 ? (
              <p className="muted-copy">None detected.</p>
            ) : (
              Object.entries(catalog.schemas).map(([name, value]) => (
                <GenericDetails key={name} title={name} value={value} />
              ))
            )}
          </div>
          <div>
            <h4>Security schemes</h4>
            {Object.keys(catalog.securitySchemes).length === 0 ? (
              <p className="muted-copy">None detected.</p>
            ) : (
              Object.entries(catalog.securitySchemes).map(([name, value]) => (
                <GenericDetails key={name} title={name} value={value} />
              ))
            )}
          </div>
        </div>
      </div>
      {catalog.unresolvedRefs.length > 0 && (
        <div className="catalog-unresolved" role="status">
          <h3>Unresolved local references</h3>
          <p>These references are retained as source data and were not substituted.</p>
          <ul>
            {catalog.unresolvedRefs.map((reference) => (
              <li key={reference}>
                <code>{reference}</code>
              </li>
            ))}
          </ul>
        </div>
      )}
      <DependencyPanel
        document={document}
        documents={documents}
        onSelectDocument={onSelectDocument}
      />
    </section>
  );
}

export function DependencyPanel({
  document,
  documents,
  onSelectDocument,
}: {
  document: DocumentResponse;
  documents: DocumentSummary[];
  onSelectDocument: (document: DocumentSummary, operationId?: string) => void;
}): ReactNode {
  const catalogs = documents.filter((candidate) => candidate.kind === 'catalog');
  const workflows = documents.filter((candidate) => candidate.kind === 'workflow');
  const outboundCatalogs = catalogs.filter((candidate) =>
    document.catalogReferences.some((reference) => candidate.path.endsWith(reference)),
  );
  const outboundSubflows = workflows.filter((candidate) =>
    document.subflowReferences.some((reference) => referenceMatches(candidate, reference)),
  );
  const inbound =
    document.kind === 'catalog'
      ? workflows.filter((candidate) =>
          candidate.catalogReferences.some((reference) => document.path.endsWith(reference)),
        )
      : document.reusableSubflow === true || document.path.includes('/sub_flows/')
        ? workflows.filter((candidate) =>
            candidate.subflowReferences.some((reference) => referenceMatches(document, reference)),
          )
        : [];
  const unresolvedCatalogs = document.catalogReferences.filter(
    (reference) => !catalogs.some((candidate) => candidate.path.endsWith(reference)),
  );
  const unresolvedSubflows = document.subflowReferences.filter(
    (reference) => !workflows.some((candidate) => referenceMatches(candidate, reference)),
  );
  return (
    <div className="metadata-section dependency-panel">
      <h3>Dependencies</h3>
      <div className="dependency-grid">
        <DependencyGroup title="Outbound catalogs">
          {outboundCatalogs.map((candidate) => (
            <DependencyButton
              key={candidate.id}
              document={candidate}
              onSelectDocument={onSelectDocument}
            />
          ))}
          {document.catalogAliases.map((alias) => (
            <span className="dependency-unresolved" key={`alias:${alias}`}>
              Alias: {alias}
            </span>
          ))}
          {unresolvedCatalogs.map((reference) => (
            <span className="dependency-unresolved" key={`missing:${reference}`}>
              Missing: {reference}
            </span>
          ))}
          {outboundCatalogs.length === 0 &&
            document.catalogAliases.length === 0 &&
            unresolvedCatalogs.length === 0 && <span className="muted-copy">None detected.</span>}
        </DependencyGroup>
        <DependencyGroup title="Outbound subflows">
          {outboundSubflows.map((candidate) => (
            <DependencyButton
              key={candidate.id}
              document={candidate}
              onSelectDocument={onSelectDocument}
            />
          ))}
          {unresolvedSubflows.map((reference) => (
            <span className="dependency-unresolved" key={`missing-subflow:${reference}`}>
              Missing: {reference}
            </span>
          ))}
          {outboundSubflows.length === 0 && unresolvedSubflows.length === 0 && (
            <span className="muted-copy">None detected.</span>
          )}
        </DependencyGroup>
        <DependencyGroup title="Inbound references">
          {inbound.map((candidate) => (
            <DependencyButton
              key={candidate.id}
              document={candidate}
              onSelectDocument={onSelectDocument}
            />
          ))}
          {inbound.length === 0 && (
            <span className="muted-copy">None detected in the current workspace.</span>
          )}
        </DependencyGroup>
      </div>
      {document.functionReferences.length > 0 && (
        <div className="dependency-functions">
          <strong>Workflow function references</strong>
          <ul>
            {document.functionReferences.map((reference) => (
              <li key={reference}>
                <code>{reference}</code>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function DependencyGroup({ title, children }: { title: string; children: ReactNode }): ReactNode {
  return (
    <div className="dependency-group">
      <h4>{title}</h4>
      <div className="dependency-list">{children}</div>
    </div>
  );
}
function DependencyButton({
  document,
  onSelectDocument,
}: {
  document: DocumentSummary;
  onSelectDocument: (document: DocumentSummary, operationId?: string) => void;
}): ReactNode {
  return (
    <button type="button" onClick={() => onSelectDocument(document)}>
      {document.name ?? document.displayName}
      <small>{document.path}</small>
    </button>
  );
}
function CatalogField({ label, value }: { label: string; value: unknown }): ReactNode {
  return <GenericDetails title={label} value={value} />;
}
function SourceLineButton({
  line,
  onSourceLine,
}: {
  line: number;
  onSourceLine: (line: number) => void;
}): ReactNode {
  return (
    <button className="source-link" type="button" onClick={() => onSourceLine(line)}>
      line {line}
    </button>
  );
}

function parseCatalog(document: DocumentResponse): CatalogModel {
  const root = record(document.sourceTree);
  const info = record(root?.info);
  const components = record(root?.components);
  const paths = record(root?.paths);
  const operations: CatalogOperation[] = [];
  Object.entries(paths ?? {}).forEach(([path, pathValue]) => {
    const pathItem = record(pathValue);
    Object.entries(pathItem ?? {}).forEach(([method, value]) => {
      if (!HTTP_METHODS.has(method.toLowerCase())) return;
      const operation = record(value);
      if (!operation) return;
      const operationId = stringValue(operation.operationId);
      operations.push({
        path,
        method: method.toLowerCase(),
        operationId,
        summary: stringValue(operation.summary),
        description: stringValue(operation.description),
        parameters: array(operation.parameters).map(record).filter(Boolean) as Array<
          Record<string, unknown>
        >,
        requestBody: record(operation.requestBody),
        responses: record(operation.responses) ?? {},
        callbacks: record(operation.callbacks) ?? {},
        security: operation.security,
        sourceLine: findSourceLine(document.content, operationId ?? path),
      });
    });
  });
  const refs = collectRefs(root);
  return {
    root,
    title: stringValue(info?.title) ?? '',
    version: stringValue(info?.version) ?? '',
    description: stringValue(info?.description),
    servers: array(root?.servers).map(record).filter(Boolean) as Array<Record<string, unknown>>,
    operations,
    schemas: record(components?.schemas) ?? {},
    securitySchemes: record(components?.securitySchemes) ?? {},
    refs,
    unresolvedRefs: refs.filter(
      (reference) => reference.startsWith('#/') && resolvePointer(root, reference) === undefined,
    ),
  };
}

function operationTree(
  root: Record<string, unknown> | null,
  operation: { path: string; method: string } | null,
): Record<string, unknown> | null {
  if (!root || !operation) return null;
  const paths = record(root.paths);
  const pathItem = record(paths?.[operation.path]);
  return record(pathItem?.[operation.method.toLowerCase()]);
}

const HTTP_METHODS = new Set(['get', 'post', 'put', 'patch', 'delete', 'options', 'head', 'trace']);

function referenceMatches(document: DocumentSummary, reference: string): boolean {
  return [document.id, document.workflowId, document.name, document.displayName, document.path]
    .filter(Boolean)
    .some((value) => value === reference || value?.endsWith(reference));
}
function collectRefs(value: unknown, refs: string[] = []): string[] {
  if (Array.isArray(value)) value.forEach((item) => collectRefs(item, refs));
  else if (value && typeof value === 'object')
    Object.entries(value).forEach(([key, child]) => {
      if (key === '$ref' && typeof child === 'string') refs.push(child);
      collectRefs(child, refs);
    });
  return [...new Set(refs)];
}
function resolvePointer(root: Record<string, unknown> | null, reference: string): unknown {
  if (!root || !reference.startsWith('#/')) return undefined;
  return reference
    .slice(2)
    .split('/')
    .map((part) => part.replace(/~1/g, '/').replace(/~0/g, '~'))
    .reduce<unknown>((value, part) => record(value)?.[part], root);
}
function findSourceLine(content: string, value: string): number | null {
  if (!value) return null;
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match =
    new RegExp(`^\\s*(?:["']?${escaped}["']?)\\s*:`, 'm').exec(content) ??
    new RegExp(`\\b${escaped}\\b`).exec(content);
  return match ? content.slice(0, match.index).split(/\r?\n/).length : null;
}
function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}
function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function formatExample(value: unknown): string {
  if (value === undefined) return '';
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return '';
  }
}
