import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import {
  applyStateField,
  applyStateOperation,
  parseStateSummaries,
  stateFieldKeys,
  stateFieldText,
  type StateFieldKind,
  type StateOperation,
} from './state-patch';
import { parseDefinitions } from './definition-patch';
import { workflow08StateTypes } from './graph';
import { fetchDocument, type DocumentResponse, type DocumentSummary } from './workspace';
import { patchSubflowInvocation, subflowInvocations } from './subflow-patch';

const stateTypes: string[] = [...workflow08StateTypes];

const specializedStateFieldKeys = new Set([
  'name',
  'type',
  'transition',
  'stateDataFilter',
  'timeouts',
  'usedForCompensation',
  'compensatedBy',
  'onErrors',
  'end',
  'data',
  'actionMode',
  'actions',
  'dataConditions',
  'eventConditions',
  'defaultCondition',
  'action',
  'eventRef',
  'eventDataFilter',
  'onEvents',
  'exclusive',
  'duration',
  'inputCollection',
  'outputCollection',
  'iterationParam',
  'mode',
  'batchSize',
  'branches',
  'completionType',
  'numCompleted',
]);

type AdvancedField = {
  key: string;
  label: string;
  help: string;
  kind: StateFieldKind;
  rows: number;
};

function fieldsForStateType(type: string): AdvancedField[] {
  const common: AdvancedField[] = [
    {
      key: 'stateDataFilter',
      label: 'State data filter',
      help: 'Optional input/output expressions applied around the state.',
      kind: 'structured',
      rows: 4,
    },
    {
      key: 'timeouts',
      label: 'Timeouts',
      help: 'State/action/branch/event execution timeout definitions.',
      kind: 'structured',
      rows: 4,
    },
    {
      key: 'usedForCompensation',
      label: 'Used for compensation',
      help: 'Whether this state is a compensation state.',
      kind: 'text',
      rows: 1,
    },
    {
      key: 'compensatedBy',
      label: 'Compensated by',
      help: 'Optional state name responsible for compensating this state.',
      kind: 'text',
      rows: 1,
    },
    {
      key: 'onErrors',
      label: 'Error handlers',
      help: 'JSON/YAML errorRef or errorRefs entries with transition/end behavior.',
      kind: 'structured',
      rows: 6,
    },
    {
      key: 'end',
      label: 'End definition',
      help: 'Use true or an end definition object; leave blank when this state continues.',
      kind: 'structured',
      rows: 4,
    },
  ];
  if (type === 'inject') {
    return [
      {
        key: 'data',
        label: 'Injected data',
        help: 'JSON/YAML object placed into state data.',
        kind: 'structured',
        rows: 6,
      },
      ...common,
    ];
  }
  if (type === 'operation') {
    return [
      {
        key: 'actionMode',
        label: 'Action mode',
        help: 'Run actions sequentially or in parallel.',
        kind: 'text',
        rows: 1,
      },
      {
        key: 'actions',
        label: 'Actions, filters, retries, and sleep intervals',
        help: 'Action definitions can include function/event references, actionDataFilter, retryRef, and sleep.',
        kind: 'structured',
        rows: 10,
      },
      ...common,
    ];
  }
  if (type === 'switch') {
    return [
      {
        key: 'dataConditions',
        label: 'Data conditions',
        help: 'Expressions with transition or end definitions.',
        kind: 'structured',
        rows: 8,
      },
      {
        key: 'eventConditions',
        label: 'Event conditions',
        help: 'Optional eventRef conditions with event data filters and transitions.',
        kind: 'structured',
        rows: 8,
      },
      {
        key: 'defaultCondition',
        label: 'Default branch',
        help: 'Fallback transition or end definition.',
        kind: 'structured',
        rows: 4,
      },
      ...common,
    ];
  }
  if (type === 'callback') {
    return [
      {
        key: 'action',
        label: 'Callback action',
        help: 'Action definition used before waiting for the callback event.',
        kind: 'structured',
        rows: 8,
      },
      {
        key: 'eventRef',
        label: 'Callback event',
        help: 'Name of the declared event that resumes this state.',
        kind: 'text',
        rows: 1,
      },
      {
        key: 'eventDataFilter',
        label: 'Event data filter',
        help: 'Event payload selection and state-data merge behavior.',
        kind: 'structured',
        rows: 5,
      },
      ...common,
    ];
  }
  if (type === 'event') {
    return [
      {
        key: 'onEvents',
        label: 'Trigger events',
        help: 'Event triggers and their action definitions.',
        kind: 'structured',
        rows: 8,
      },
      {
        key: 'exclusive',
        label: 'Exclusive event handling',
        help: 'When true, the first matching event proceeds.',
        kind: 'text',
        rows: 1,
      },
      ...common,
    ];
  }
  if (type === 'sleep') {
    return [
      {
        key: 'duration',
        label: 'Sleep duration',
        help: 'ISO 8601 duration such as PT5S or P1D.',
        kind: 'text',
        rows: 1,
      },
      ...common,
    ];
  }
  if (type === 'foreach') {
    return [
      {
        key: 'inputCollection',
        label: 'Input collection expression',
        help: 'Expression selecting the array to iterate.',
        kind: 'text',
        rows: 1,
      },
      {
        key: 'outputCollection',
        label: 'Output collection expression',
        help: 'Expression selecting where iteration results are written.',
        kind: 'text',
        rows: 1,
      },
      {
        key: 'iterationParam',
        label: 'Iteration parameter',
        help: 'Name used by actions for the current item.',
        kind: 'text',
        rows: 1,
      },
      {
        key: 'mode',
        label: 'Iteration mode',
        help: 'Run iterations sequentially or in parallel.',
        kind: 'text',
        rows: 1,
      },
      {
        key: 'batchSize',
        label: 'Batch size',
        help: 'Maximum parallel iterations; use 0 for runtime default.',
        kind: 'text',
        rows: 1,
      },
      {
        key: 'actions',
        label: 'Iteration actions',
        help: 'Actions executed for each collection item.',
        kind: 'structured',
        rows: 8,
      },
      ...common,
    ];
  }
  if (type === 'parallel') {
    return [
      {
        key: 'branches',
        label: 'Branches',
        help: 'Branch definitions and their state lists.',
        kind: 'structured',
        rows: 10,
      },
      {
        key: 'completionType',
        label: 'Completion type',
        help: 'allOf or atLeast branch completion.',
        kind: 'text',
        rows: 1,
      },
      {
        key: 'numCompleted',
        label: 'Minimum completed branches',
        help: 'Used with atLeast completion.',
        kind: 'text',
        rows: 1,
      },
      ...common,
    ];
  }
  return common;
}

function SubflowContractValue({ title, value }: { title: string; value: unknown }): ReactNode {
  return (
    <div className="generic-detail">
      <strong>{title}</strong>
      <pre>{value === undefined ? 'Not declared' : JSON.stringify(value, null, 2)}</pre>
    </div>
  );
}

export function StateEditor({
  document,
  source,
  onChange,
  onOpenSource,
  initialStateName,
  saving,
  subflows = [],
  onSelectSubflow,
}: {
  document: DocumentResponse;
  source: string;
  onChange: (source: string) => void;
  onOpenSource: (line?: number) => void;
  initialStateName?: string | null | undefined;
  saving: boolean;
  subflows?: DocumentSummary[];
  onSelectSubflow?: (document: DocumentSummary) => void;
}): ReactNode {
  const states = useMemo(
    () => parseStateSummaries(source, document.format),
    [document.format, source],
  );
  const [selectedIndex, setSelectedIndex] = useState(() => {
    if (!initialStateName) return 0;
    const index = states.findIndex((state) => state.name === initialStateName);
    return index >= 0 ? index : 0;
  });
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState('inject');
  const [newPropertyName, setNewPropertyName] = useState('');
  const [newPropertyValue, setNewPropertyValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [selectedInvocationIndex, setSelectedInvocationIndex] = useState(0);
  const [subflowDraft, setSubflowDraft] = useState<{
    selectionKey: string;
    reference: string;
    version: string;
    actionName: string;
  }>({ selectionKey: '', reference: '', version: '1.0', actionName: 'Invoke subflow' });
  const [subflowDocuments, setSubflowDocuments] = useState<Record<string, DocumentResponse>>({});
  const subflowCache = useRef<Record<string, DocumentResponse>>({});
  useEffect(() => {
    let cancelled = false;
    const pending = subflows.filter((subflow) => !subflowCache.current[subflow.id]);
    if (pending.length === 0) return () => undefined;
    void Promise.all(
      pending.map(async (subflow) => {
        try {
          const loaded = await fetchDocument(subflow);
          subflowCache.current[subflow.id] = loaded;
          return loaded;
        } catch {
          return null;
        }
      }),
    ).then((loaded) => {
      if (cancelled) return;
      const entries = loaded.filter((item): item is DocumentResponse => item !== null);
      if (entries.length > 0) {
        setSubflowDocuments((items) => ({
          ...items,
          ...Object.fromEntries(entries.map((item) => [item.id, item])),
        }));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [subflows]);
  const selected = states[selectedIndex] ?? states[0];
  const actualIndex = selected ? states.findIndex((state) => state.name === selected.name) : -1;
  const topLevelErrors = useMemo(() => {
    return parseDefinitions(source, document.format, 'errors').map((error) => error.name);
  }, [document.format, source]);
  const advancedFields = useMemo(
    () => fieldsForStateType(selected?.type ?? 'inject'),
    [selected?.type],
  );
  const selectionKey = `${actualIndex}:${selected?.type ?? 'none'}`;
  const initialAdvancedValues = Object.fromEntries(
    advancedFields.map((field) => [
      field.key,
      stateFieldText(source, document.format, actualIndex, field.key),
    ]),
  );
  const [advancedState, setAdvancedState] = useState<{
    selectionKey: string;
    values: Record<string, string>;
  }>({ selectionKey: '', values: {} });
  const advancedValues =
    advancedState.selectionKey === selectionKey ? advancedState.values : initialAdvancedValues;
  const genericPropertyKeys = useMemo(
    () =>
      stateFieldKeys(source, document.format, actualIndex).filter(
        (key) => !specializedStateFieldKeys.has(key),
      ),
    [actualIndex, document.format, source],
  );
  const invocations = useMemo(
    () => subflowInvocations(source, document.format, actualIndex),
    [actualIndex, document.format, source],
  );
  const activeInvocationIndex = Math.min(
    selectedInvocationIndex,
    Math.max(invocations.length - 1, 0),
  );
  const activeInvocation = invocations[activeInvocationIndex];
  const subflowChoices = useMemo(
    () =>
      subflows.map((subflow) => {
        const loaded = subflowDocuments[subflow.id];
        const loadedId = loaded?.metadata?.workflowId;
        const sourceId = loaded?.sourceTree?.id;
        const reference =
          loadedId ||
          (typeof sourceId === 'string' ? sourceId : null) ||
          subflow.name ||
          subflow.displayName;
        return {
          document: subflow,
          reference,
          label: `${reference} · ${subflow.path}`,
        };
      }),
    [subflowDocuments, subflows],
  );
  const subflowSelectionKey = `${selectionKey}:${activeInvocationIndex}`;
  const initialSubflowDraft =
    subflowDraft.selectionKey === subflowSelectionKey
      ? subflowDraft
      : {
          selectionKey: subflowSelectionKey,
          reference: subflowChoices[0]?.reference ?? '',
          version: '1.0',
          actionName: 'Invoke subflow',
        };
  const subflowReference = activeInvocation?.reference ?? initialSubflowDraft.reference;
  const subflowVersion = activeInvocation?.version ?? initialSubflowDraft.version;
  const subflowActionName = activeInvocation?.actionName ?? initialSubflowDraft.actionName;
  const targetChoice = subflowChoices.find((choice) => choice.reference === subflowReference);
  const targetDocument = targetChoice ? subflowDocuments[targetChoice.document.id] : undefined;
  const showSubflowEditor =
    Boolean(selected) &&
    (selected?.type === 'operation' || selected?.type === 'foreach' || invocations.length > 0);

  const apply = (operation: StateOperation) => {
    const result = applyStateOperation(source, document.format, operation);
    setError(result.error);
    if (!result.error) onChange(result.source);
  };

  const create = () => {
    const name = newName.trim();
    if (!name) {
      setError('Enter a name for the new state.');
      return;
    }
    apply({ kind: 'create', name, type: newType });
    setNewName('');
  };

  const updateSelected = (changes: Extract<StateOperation, { kind: 'edit' }>) => {
    if (actualIndex < 0) return;
    apply({ ...changes, kind: 'edit', index: actualIndex });
  };

  const updateAdvanced = (field: AdvancedField, value: string) => {
    if (actualIndex < 0) return;
    setAdvancedState({
      selectionKey,
      values: { ...advancedValues, [field.key]: value },
    });
    const result = applyStateField(source, document.format, actualIndex, field.key, value);
    setError(result.error);
    if (!result.error) onChange(result.source);
  };

  const updateGenericProperty = (key: string, value: string) => {
    if (actualIndex < 0) return;
    const result = applyStateField(source, document.format, actualIndex, key, value);
    setError(result.error);
    if (!result.error) onChange(result.source);
  };

  const updateSubflowDraft = (changes: Partial<typeof initialSubflowDraft>) => {
    setSubflowDraft({ ...initialSubflowDraft, ...changes, selectionKey: subflowSelectionKey });
  };

  const updateSubflow = (changes: Partial<typeof initialSubflowDraft>) => {
    const reference = changes.reference ?? subflowReference;
    const version = changes.version ?? subflowVersion;
    const actionName = changes.actionName ?? subflowActionName;
    if (!activeInvocation) {
      updateSubflowDraft({ reference, version, actionName });
      return;
    }
    const result = patchSubflowInvocation(
      source,
      document.format,
      actualIndex,
      reference,
      version,
      actionName,
      activeInvocation.index,
    );
    setError(result.error);
    if (!result.error) onChange(result.source);
  };

  const addSubflow = () => {
    const result = patchSubflowInvocation(
      source,
      document.format,
      actualIndex,
      subflowReference,
      subflowVersion,
      subflowActionName,
    );
    setError(result.error);
    if (!result.error) onChange(result.source);
  };

  const addGenericProperty = () => {
    const key = newPropertyName.trim();
    if (!key) {
      setError('Enter a property name before adding a generic state property.');
      return;
    }
    if (specializedStateFieldKeys.has(key) || genericPropertyKeys.includes(key)) {
      setError(`The property “${key}” is already represented by this state editor.`);
      return;
    }
    const result = applyStateField(source, document.format, actualIndex, key, newPropertyValue);
    setError(result.error);
    if (!result.error) {
      onChange(result.source);
      setNewPropertyName('');
      setNewPropertyValue('');
    }
  };

  return (
    <section className="state-editor" aria-labelledby="state-editor-title">
      <div className="state-editor-heading">
        <div>
          <p className="eyebrow">State projection · source-preserving draft</p>
          <h3 id="state-editor-title">State authoring</h3>
          <p className="muted-copy">
            Create and arrange core states while preserving comments, extensions, and fields this
            form does not edit.
          </p>
        </div>
        <button className="button button-secondary" type="button" onClick={() => onOpenSource()}>
          Open source
        </button>
      </div>
      {states.length === 0 ? (
        <p className="form-notice" role="status">
          No editable states were found. Check the source diagnostics before creating one.
        </p>
      ) : (
        <div className="state-editor-layout">
          <div className="state-list" aria-label="Workflow states">
            {states.map((state, index) => (
              <button
                className={`state-list-item${index === actualIndex ? ' is-selected' : ''}`}
                key={`${state.name}-${index}`}
                type="button"
                onClick={() => {
                  setSelectedIndex(index);
                  setError(null);
                }}
              >
                <strong>{state.name}</strong>
                <span>{state.type}</span>
              </button>
            ))}
          </div>
          <div className="state-editor-detail">
            {selected && (
              <>
                <div className="state-toolbar">
                  <button
                    className="button button-secondary"
                    type="button"
                    onClick={() =>
                      apply({
                        kind: 'duplicate',
                        index: actualIndex,
                        name: `${selected.name} Copy`,
                      })
                    }
                  >
                    Duplicate
                  </button>
                  <button
                    className="button button-secondary"
                    type="button"
                    onClick={() => apply({ kind: 'move', index: actualIndex, direction: 'up' })}
                    disabled={actualIndex <= 0}
                  >
                    Move up
                  </button>
                  <button
                    className="button button-secondary"
                    type="button"
                    onClick={() => apply({ kind: 'move', index: actualIndex, direction: 'down' })}
                    disabled={actualIndex < 0 || actualIndex >= states.length - 1}
                  >
                    Move down
                  </button>
                  <button
                    className="button button-danger"
                    type="button"
                    onClick={() => apply({ kind: 'delete', index: actualIndex })}
                  >
                    Delete
                  </button>
                </div>
                <div className="metadata-form-grid state-fields">
                  <label className="metadata-form-field">
                    <span>State name</span>
                    <input
                      value={selected.name}
                      onChange={(event) => {
                        const value = event.target.value;
                        if (value.trim() && value !== selected.name) {
                          apply({ kind: 'rename', index: actualIndex, name: value.trim() });
                        }
                      }}
                      onBlur={(event) => {
                        if (!event.target.value.trim()) setError('State names cannot be empty.');
                      }}
                    />
                    <small>Renaming updates the workflow start and transition references.</small>
                  </label>
                  <label className="metadata-form-field">
                    <span>State type</span>
                    <select
                      value={stateTypes.includes(selected.type) ? selected.type : 'inject'}
                      onChange={(event) =>
                        updateSelected({
                          kind: 'edit',
                          index: actualIndex,
                          type: event.target.value,
                        })
                      }
                    >
                      {stateTypes.map((type) => (
                        <option key={type} value={type}>
                          {type}
                        </option>
                      ))}
                    </select>
                    <small>Core runtime state forms supported by this editor.</small>
                  </label>
                  <label className="metadata-form-field">
                    <span>Transition</span>
                    <select
                      value={selected.transition ?? ''}
                      onChange={(event) =>
                        updateSelected({
                          kind: 'edit',
                          index: actualIndex,
                          transition: event.target.value || null,
                        })
                      }
                    >
                      <option value="">No direct transition</option>
                      {states
                        .filter((state) => state.name !== selected.name)
                        .map((state) => (
                          <option key={state.name} value={state.name}>
                            {state.name}
                          </option>
                        ))}
                    </select>
                    <small>Direct transitions are validated against declared state names.</small>
                  </label>
                  <label className="metadata-form-field metadata-form-checkbox">
                    <span>End state</span>
                    <input
                      type="checkbox"
                      checked={selected.end}
                      onChange={(event) =>
                        updateSelected({
                          kind: 'edit',
                          index: actualIndex,
                          end: event.target.checked,
                        })
                      }
                    />
                    <small>
                      Terminal behavior is represented by <code>end: true</code>.
                    </small>
                  </label>
                </div>
                <details className="state-advanced-note">
                  <summary>Advanced state fields</summary>
                  <p>
                    The type-specific controls below edit actions, filters, conditions, callbacks,
                    retry/sleep definitions, timeouts, and error handlers. Existing unsupported
                    fields remain source-visible and are preserved.
                  </p>
                </details>
                <div className="state-advanced-fields">
                  <div>
                    <h4>Type-specific fields</h4>
                    <p className="muted-copy">
                      Structured values accept JSON or an indented YAML fragment. Only the field
                      being edited is rewritten; other state fields remain intact.
                    </p>
                  </div>
                  {advancedFields.map((field) => (
                    <label className="metadata-form-field metadata-form-field-wide" key={field.key}>
                      <span>{field.label}</span>
                      <textarea
                        aria-label={field.label}
                        value={advancedValues[field.key] ?? ''}
                        rows={field.rows}
                        spellCheck={false}
                        placeholder={field.kind === 'text' ? 'Enter a value' : '{}'}
                        onChange={(event) => updateAdvanced(field, event.target.value)}
                      />
                      <small>{field.help}</small>
                      {field.key === 'onErrors' && topLevelErrors.length > 0 && (
                        <small>Known top-level errors: {topLevelErrors.join(', ')}</small>
                      )}
                    </label>
                  ))}
                  <details className="state-generic-properties">
                    <summary>Other state properties</summary>
                    <p className="muted-copy">
                      Edit valid 0.8 fields not yet specialized here, extensions, or preserved
                      fields. Values accept JSON or a YAML scalar/fragment and remain in the
                      state&apos;s original property order when possible.
                    </p>
                    {genericPropertyKeys.map((key) => (
                      <label className="metadata-form-field metadata-form-field-wide" key={key}>
                        <span>
                          <code>{key}</code>
                        </span>
                        <textarea
                          aria-label={`Property ${key}`}
                          value={stateFieldText(source, document.format, actualIndex, key)}
                          rows={4}
                          spellCheck={false}
                          onChange={(event) => updateGenericProperty(key, event.target.value)}
                        />
                        <small>Clear the value to remove this direct property.</small>
                      </label>
                    ))}
                    <div className="state-generic-add">
                      <label className="metadata-form-field">
                        <span>New property name</span>
                        <input
                          aria-label="New property name"
                          value={newPropertyName}
                          onChange={(event) => setNewPropertyName(event.target.value)}
                          placeholder="dataInput"
                        />
                      </label>
                      <label className="metadata-form-field metadata-form-field-wide">
                        <span>New property value</span>
                        <textarea
                          aria-label="New property value"
                          value={newPropertyValue}
                          rows={4}
                          spellCheck={false}
                          onChange={(event) => setNewPropertyValue(event.target.value)}
                          placeholder='{"example":true}'
                        />
                      </label>
                      <button
                        className="button button-secondary"
                        type="button"
                        onClick={addGenericProperty}
                      >
                        Add property
                      </button>
                    </div>
                  </details>
                  <aside
                    className="form-guidance expression-guidance"
                    aria-label="Expression guidance"
                  >
                    <p className="eyebrow">Safe expression examples</p>
                    <h4>Expressions remain authored text</h4>
                    <p>
                      Studio stores expressions without evaluating them. Local validation checks
                      placement and document shape where the profile supports it.
                    </p>
                    <ul>
                      <li>
                        <code>{'${ .status == "ready" }'}</code> — boolean condition
                      </li>
                      <li>
                        <code>{'${ .items | length }'}</code> — numeric projection
                      </li>
                      <li>
                        <code>{'${ .result }'}</code> — data/filter projection
                      </li>
                    </ul>
                  </aside>
                </div>
                {showSubflowEditor && (
                  <section
                    className="metadata-section subflow-invocation-editor"
                    aria-labelledby="subflow-invocation-title"
                  >
                    <div className="metadata-heading">
                      <div>
                        <p className="eyebrow">Action projection · source-preserving draft</p>
                        <h4 id="subflow-invocation-title">Subflow invocation</h4>
                        <p className="muted-copy">
                          Choose a local Serverless Workflow 0.8 subflow and keep its action data
                          filters and transition fields intact.
                        </p>
                      </div>
                      {activeInvocation && activeInvocation.line && (
                        <button
                          className="button button-secondary"
                          type="button"
                          onClick={() => onOpenSource(activeInvocation.line ?? undefined)}
                        >
                          Open action source
                        </button>
                      )}
                    </div>
                    {invocations.length > 1 && (
                      <label className="metadata-form-field">
                        <span>Selected subflow action</span>
                        <select
                          aria-label="Selected subflow action"
                          value={activeInvocationIndex}
                          onChange={(event) =>
                            setSelectedInvocationIndex(Number(event.target.value))
                          }
                        >
                          {invocations.map((invocation) => (
                            <option key={invocation.index} value={invocation.index}>
                              {invocation.actionName} · {invocation.reference}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                    <div className="metadata-form-grid">
                      <label className="metadata-form-field">
                        <span>Target subflow</span>
                        <select
                          aria-label="Target subflow"
                          value={subflowReference}
                          onChange={(event) => updateSubflow({ reference: event.target.value })}
                        >
                          {!subflowReference && <option value="">Select a local subflow</option>}
                          {subflowReference && !targetChoice && (
                            <option value={subflowReference}>Unresolved: {subflowReference}</option>
                          )}
                          {subflowChoices.map((choice) => (
                            <option key={choice.document.id} value={choice.reference}>
                              {choice.label}
                            </option>
                          ))}
                          {subflowChoices.length === 0 && !subflowReference && (
                            <option value="">No local subflows found</option>
                          )}
                        </select>
                        <small>
                          References use the target document&apos;s workflow id; unresolved existing
                          references remain selectable for repair.
                        </small>
                      </label>
                      <label className="metadata-form-field">
                        <span>Subflow version</span>
                        <input
                          aria-label="Subflow version"
                          value={subflowVersion}
                          onChange={(event) => updateSubflow({ version: event.target.value })}
                          placeholder="1.0"
                        />
                        <small>Version is written on the subflow action.</small>
                      </label>
                      <label className="metadata-form-field">
                        <span>Action name</span>
                        <input
                          aria-label="Subflow action name"
                          value={subflowActionName}
                          onChange={(event) => updateSubflow({ actionName: event.target.value })}
                          placeholder="Invoke subflow"
                        />
                        <small>
                          Used when a new action is added or an existing action is renamed.
                        </small>
                      </label>
                    </div>
                    {!activeInvocation && (
                      <button
                        className="button button-primary"
                        type="button"
                        onClick={addSubflow}
                        disabled={!subflowReference || saving}
                      >
                        Add subflow action
                      </button>
                    )}
                    {targetChoice && (
                      <div className="subflow-contract-preview">
                        <div>
                          <strong>Target contract</strong>
                          <small>{targetChoice.document.path}</small>
                        </div>
                        {onSelectSubflow && (
                          <button
                            className="button button-secondary"
                            type="button"
                            onClick={() => onSelectSubflow(targetChoice.document)}
                          >
                            Open target
                          </button>
                        )}
                        <div className="generic-grid">
                          <SubflowContractValue
                            title="Inputs"
                            value={
                              targetDocument?.sourceTree?.inputs ??
                              targetDocument?.sourceTree?.input
                            }
                          />
                          <SubflowContractValue
                            title="Outputs"
                            value={
                              targetDocument?.sourceTree?.outputs ??
                              targetDocument?.sourceTree?.output
                            }
                          />
                          <SubflowContractValue
                            title="Errors"
                            value={targetDocument?.sourceTree?.errors}
                          />
                          <SubflowContractValue
                            title="Timeouts"
                            value={targetDocument?.sourceTree?.timeouts}
                          />
                        </div>
                      </div>
                    )}
                  </section>
                )}
              </>
            )}
          </div>
        </div>
      )}
      <div className="state-create-panel">
        <strong>Create state</strong>
        <input
          aria-label="New state name"
          placeholder="New state name"
          value={newName}
          onChange={(event) => setNewName(event.target.value)}
        />
        <select
          aria-label="New state type"
          value={newType}
          onChange={(event) => setNewType(event.target.value)}
        >
          {stateTypes.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
        <button className="button button-primary" type="button" onClick={create} disabled={saving}>
          Add state
        </button>
      </div>
      {error && (
        <p className="field-error state-editor-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
