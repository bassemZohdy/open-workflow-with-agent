import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import {
  patchMetadataSource,
  scalarMetadataFromSource,
  structuredMetadataText,
  topLevelKeysFromSource,
  type MetadataChanges,
  type MetadataField,
} from './metadata-patch';
import {
  classificationForField,
  guidanceForVersion,
  knownWorkflowTopLevelFields,
  type FieldClassification,
} from './metadata-guidance';
import { type DocumentResponse, type DocumentSummary } from './workspace';
import { StateEditor } from './state-editor';
import { DefinitionEditor } from './definition-editor';
import { parseStateSummaries } from './state-patch';

const scalarFields: Array<{ key: MetadataField; label: string; help: string; required?: boolean }> =
  [
    {
      key: 'id',
      label: 'Workflow ID',
      help: 'Stable identifier used by the runtime.',
      required: true,
    },
    { key: 'name', label: 'Name', help: 'Human-readable workflow name.', required: true },
    { key: 'description', label: 'Description', help: 'Optional author-facing summary.' },
    { key: 'version', label: 'Workflow version', help: 'User-managed document version.' },
    {
      key: 'specVersion',
      label: 'Specification version',
      help: 'The supported authoring profile is Serverless Workflow 0.8.',
      required: true,
    },
    {
      key: 'expressionLang',
      label: 'Expression language',
      help: 'Optional expression language declaration; expressions remain text.',
    },
  ];

const structuredFields: Array<{ key: MetadataField; label: string; help: string }> = [
  { key: 'timeouts', label: 'Timeouts', help: 'JSON/YAML-compatible object or value.' },
  { key: 'constants', label: 'Constants', help: 'JSON/YAML-compatible object.' },
  { key: 'annotations', label: 'Annotations', help: 'JSON/YAML-compatible object.' },
  { key: 'extensions', label: 'Extensions', help: 'JSON/YAML-compatible list or object.' },
];

function ClassificationBadge({ status }: { status: FieldClassification }): ReactNode {
  return <em className={`field-classification field-classification-${status}`}>{status}</em>;
}

export function MetadataEditor({
  document,
  source,
  onChange,
  onSave,
  onOpenSource,
  initialStateName,
  dirty,
  saving,
  catalogs = [],
  subflows = [],
  onSelectSubflow,
}: {
  document: DocumentResponse;
  source: string;
  onChange: (source: string) => void;
  onSave: () => void;
  onOpenSource: (line?: number) => void;
  initialStateName?: string | null | undefined;
  dirty: boolean;
  saving: boolean;
  catalogs?: DocumentSummary[];
  subflows?: DocumentSummary[];
  onSelectSubflow?: (document: DocumentSummary) => void;
}): ReactNode {
  const structuredSourceRef = useRef(source);
  const initialScalars = useMemo(
    () =>
      Object.fromEntries(
        scalarFields.map(({ key }) => [key, scalarMetadataFromSource(document, source, key)]),
      ),
    [document, source],
  ) as Partial<Record<MetadataField, string>>;
  const [structured, setStructured] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      structuredFields.map(({ key }) => [key, structuredMetadataText(document, source, key)]),
    ),
  );
  useEffect(() => {
    if (structuredSourceRef.current === source) return;
    structuredSourceRef.current = source;
    setStructured(
      Object.fromEntries(
        structuredFields.map(({ key }) => [key, structuredMetadataText(document, source, key)]),
      ),
    );
  }, [document, source]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const stateNames = useMemo(() => {
    return parseStateSummaries(source, document.format).map((state) => state.name);
  }, [document.format, source]);
  const currentStart = scalarMetadataFromSource(document, source, 'start');
  const guidance = guidanceForVersion(initialScalars.specVersion || '0.8');
  const unsupportedFields = topLevelKeysFromSource(source, document.format).filter(
    (key) => !knownWorkflowTopLevelFields.has(key),
  );
  const hasErrors = Object.values(errors).some(Boolean);
  const missingRequired =
    scalarFields.some(({ key, required }) => required && !initialScalars[key]) || !currentStart;

  const updateScalar = (key: MetadataField, value: string) => {
    if (key === 'start' && value && !stateNames.includes(value)) {
      setErrors((items) => ({ ...items, start: 'Choose a state declared in this workflow.' }));
      return;
    }
    setErrors((items) => ({ ...items, [key]: '' }));
    const patchValue = key === 'keepActive' ? (value ? value === 'true' : null) : value || null;
    onChange(
      patchMetadataSource(source, document.format, { [key]: patchValue } as MetadataChanges),
    );
  };

  const updateStructured = (key: MetadataField, value: string) => {
    setStructured((items) => ({ ...items, [key]: value }));
    try {
      const parsed = JSON.parse(value) as unknown;
      setErrors((items) => ({ ...items, [key]: '' }));
      onChange(patchMetadataSource(source, document.format, { [key]: parsed } as MetadataChanges));
    } catch {
      setErrors((items) => ({
        ...items,
        [key]: 'Enter a valid JSON value before leaving this field.',
      }));
    }
  };

  return (
    <form
      className="metadata-editor"
      onSubmit={(event) => event.preventDefault()}
      aria-labelledby="metadata-editor-title"
    >
      <div className="metadata-heading">
        <div>
          <p className="eyebrow">Form projection · source-preserving draft</p>
          <h2 id="metadata-editor-title">Workflow metadata</h2>
          <p>Edit supported top-level fields without removing unknown fields or extensions.</p>
        </div>
        <div className="context-actions">
          <button className="button button-secondary" type="button" onClick={() => onOpenSource()}>
            Open source
          </button>
          <button
            className="button button-primary"
            type="button"
            onClick={onSave}
            disabled={!dirty || saving || hasErrors || missingRequired}
          >
            {saving ? 'Saving…' : 'Save draft'}
          </button>
        </div>
      </div>
      <div className="form-notice" role="note">
        <strong>Serverless Workflow {initialScalars.specVersion || '0.8'}</strong>
        <span>Fields marked required are checked by the local validation profile before save.</span>
      </div>
      <div className="field-classification-legend" aria-label="Field classifications">
        <strong>Field classifications</strong>
        {(
          ['required', 'optional', 'defaulted', 'extension', 'unsupported'] as FieldClassification[]
        ).map((status) => (
          <span key={status}>
            <ClassificationBadge status={status} />
          </span>
        ))}
      </div>
      <div className="metadata-form-grid">
        {scalarFields.map(({ key, label, help, required }) => (
          <label className="metadata-form-field" key={key}>
            <span>
              {label}
              <ClassificationBadge status={classificationForField(key)} />
            </span>
            <input
              value={initialScalars[key] ?? ''}
              required={required}
              onChange={(event) => updateScalar(key, event.target.value)}
              aria-describedby={`${key}-help ${key}-error`}
            />
            <small id={`${key}-help`}>{help}</small>
            {(errors[key] || (required && !initialScalars[key])) && (
              <small className="field-error" id={`${key}-error`}>
                {errors[key] || 'This required field cannot be empty.'}
              </small>
            )}
          </label>
        ))}
        <label className="metadata-form-field metadata-form-checkbox">
          <span>
            Keep active <ClassificationBadge status="defaulted" />
          </span>
          <input
            type="checkbox"
            checked={initialScalars.keepActive === 'true'}
            onChange={(event) => updateScalar('keepActive', event.target.checked ? 'true' : '')}
            aria-describedby="keepActive-help"
          />
          <small id="keepActive-help">Optional runtime behavior flag.</small>
        </label>
        <label className="metadata-form-field">
          <span>
            Start state <ClassificationBadge status="required" />
          </span>
          <select
            value={currentStart}
            onChange={(event) => updateScalar('start', event.target.value)}
            aria-describedby="start-help start-error"
          >
            <option value="">Select a state</option>
            {stateNames.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
          <small id="start-help">Only declared state names can be selected.</small>
          {(errors.start || !currentStart) && (
            <small className="field-error" id="start-error">
              {errors.start || 'Choose a declared start state.'}
            </small>
          )}
        </label>
      </div>
      <div className="metadata-section">
        <h3>Structured top-level values</h3>
        <p className="muted-copy">
          These editors accept JSON syntax, which is also valid YAML. Unknown keys remain untouched.
        </p>
        <div className="metadata-form-grid">
          {structuredFields.map(({ key, label, help }) => (
            <label className="metadata-form-field metadata-form-field-wide" key={key}>
              <span>
                {label} <ClassificationBadge status={classificationForField(key)} />
              </span>
              <textarea
                value={structured[key] ?? '{}'}
                rows={4}
                spellCheck={false}
                onChange={(event) => updateStructured(key, event.target.value)}
                aria-describedby={`${key}-structured-help ${key}-structured-error`}
              />
              <small id={`${key}-structured-help`}>{help}</small>
              {errors[key] && (
                <small className="field-error" id={`${key}-structured-error`}>
                  {errors[key]}
                </small>
              )}
            </label>
          ))}
        </div>
      </div>
      <aside className="form-guidance" aria-label={guidance.title}>
        <p className="eyebrow">Version guidance</p>
        <h3>{guidance.title}</h3>
        <p>{guidance.summary}</p>
        <ul>
          {guidance.examples.map((example) => (
            <li key={example}>
              <code>{example}</code>
            </li>
          ))}
        </ul>
      </aside>
      <details className="preserved-fields">
        <summary>Preserved unsupported fields ({unsupportedFields.length})</summary>
        {unsupportedFields.length > 0 ? (
          <div className="token-row">
            {unsupportedFields.map((field) => (
              <span className="token token-neutral" key={field}>
                {field} <ClassificationBadge status="unsupported" />
              </span>
            ))}
          </div>
        ) : (
          <p className="muted-copy">
            No unsupported top-level fields detected. Source still remains authoritative.
          </p>
        )}
      </details>
      <StateEditor
        key={initialStateName ?? 'default'}
        document={document}
        source={source}
        onChange={onChange}
        onOpenSource={onOpenSource}
        initialStateName={initialStateName}
        saving={saving}
        subflows={subflows}
        {...(onSelectSubflow ? { onSelectSubflow } : {})}
      />
      <DefinitionEditor
        document={document}
        source={source}
        onChange={onChange}
        onOpenSource={onOpenSource}
        saving={saving}
        catalogs={catalogs}
      />
      <p className="detail-footnote">
        The form edits the same draft as Source. Review the diff before saving; formatting and
        comments are not silently normalized.
      </p>
    </form>
  );
}
