import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { catalogOperationsFromSource } from './catalog-patch';
import {
  addCatalogAlias,
  applyDefinitionField,
  applyDefinitionOperation,
  catalogAliasDefinitions,
  catalogAliasReferenceDetails,
  deleteCatalogAlias,
  definitionFieldText,
  definitionReferenceDetails,
  patchCatalogAlias,
  parseDefinitions,
  type DefinitionKind,
  type DefinitionOperation,
  type DefinitionReference,
} from './definition-patch';
import { fetchDocument, type DocumentResponse, type DocumentSummary } from './workspace';

const collections: Array<{ key: DefinitionKind; label: string }> = [
  { key: 'functions', label: 'Functions' },
  { key: 'events', label: 'Events' },
  { key: 'errors', label: 'Errors' },
];

function fieldsFor(
  collection: DefinitionKind,
): Array<{ key: string; label: string; help: string }> {
  if (collection === 'functions')
    return [
      {
        key: 'operation',
        label: 'Operation',
        help: 'Catalog alias and operationId, for example agentCatalog#agentSyncCall.',
      },
    ];
  if (collection === 'events')
    return [
      {
        key: 'source',
        label: 'Source',
        help: 'CloudEvent source or an empty source when the runtime supplies it.',
      },
      { key: 'type', label: 'Type', help: 'Declared event type.' },
    ];
  return [
    { key: 'code', label: 'Code', help: 'Runtime error code associated with this reusable error.' },
  ];
}

export function DefinitionEditor({
  document,
  source,
  onChange,
  onOpenSource,
  saving,
  catalogs = [],
}: {
  document: DocumentResponse;
  source: string;
  onChange: (source: string) => void;
  onOpenSource: (line?: number) => void;
  saving: boolean;
  catalogs?: DocumentSummary[];
}): ReactNode {
  const [collection, setCollection] = useState<DefinitionKind>('functions');
  const [selectedIndices, setSelectedIndices] = useState<Record<DefinitionKind, number>>({
    functions: 0,
    events: 0,
    errors: 0,
  });
  const [newName, setNewName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [selectedAlias, setSelectedAlias] = useState('');
  const [aliasError, setAliasError] = useState('');
  const [aliasImpact, setAliasImpact] = useState<{
    alias: string;
    references: DefinitionReference[];
  } | null>(null);
  const [newAliasName, setNewAliasName] = useState('');
  const [newAliasCatalog, setNewAliasCatalog] = useState('');
  const [catalogDocuments, setCatalogDocuments] = useState<Record<string, DocumentResponse>>({});
  const catalogCache = useRef<Record<string, DocumentResponse>>({});
  useEffect(() => {
    let cancelled = false;
    const pending = catalogs.filter((catalog) => !catalogCache.current[catalog.id]);
    if (pending.length === 0) return () => undefined;
    void Promise.all(
      pending.map(async (catalog) => {
        try {
          const loaded = await fetchDocument(catalog);
          catalogCache.current[catalog.id] = loaded;
          return loaded;
        } catch {
          return null;
        }
      }),
    ).then((loaded) => {
      if (cancelled) return;
      const entries = loaded.filter((item): item is DocumentResponse => item !== null);
      if (entries.length > 0) {
        setCatalogDocuments((items) => ({
          ...items,
          ...Object.fromEntries(entries.map((item) => [item.id, item])),
        }));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [catalogs]);
  const definitions = useMemo(
    () => parseDefinitions(source, document.format, collection),
    [collection, document.format, source],
  );
  const selectedIndex = selectedIndices[collection] ?? 0;
  const selected = definitions[selectedIndex] ?? definitions[0];
  const actualIndex = selected ? definitions.findIndex((item) => item.name === selected.name) : -1;
  const fields = fieldsFor(collection);
  const references = selected
    ? definitionReferenceDetails(source, document.format, collection, selected.name)
    : [];
  const aliases = useMemo(
    () => catalogAliasDefinitions(source, document.format),
    [document.format, source],
  );
  const catalogChoices = useMemo(
    () =>
      catalogs.map((catalog) => ({
        label: catalog.path,
        reference: catalogReferenceForPath(catalog.path),
      })),
    [catalogs],
  );
  const aliasNames = Object.keys(aliases);
  const activeAlias = aliasNames.includes(selectedAlias) ? selectedAlias : (aliasNames[0] ?? '');
  const activeAliasReference = activeAlias ? aliases[activeAlias] : '';
  const operationOptions = useMemo(() => {
    return catalogs.flatMap((catalog) => {
      const loaded = catalogDocuments[catalog.id];
      if (!loaded) return [];
      const matchingAliases = Object.entries(aliases).filter(([, reference]) =>
        catalogReferenceMatches(catalog.path, reference),
      );
      return matchingAliases.flatMap(([alias]) =>
        catalogOperationsFromSource(loaded, loaded.content)
          .filter((operation) => operation.operationId)
          .map((operation) => ({
            value: `${alias}#${operation.operationId}`,
            label: `${alias}#${operation.operationId} · ${operation.method.toUpperCase()} ${operation.path}`,
          })),
      );
    });
  }, [aliases, catalogDocuments, catalogs]);

  const apply = (operation: DefinitionOperation) => {
    const result = applyDefinitionOperation(source, document.format, operation);
    setError(result.error);
    if (!result.error) onChange(result.source);
  };

  const create = () => {
    const name = newName.trim();
    if (!name) {
      setError(`Enter a name for the new ${collection.slice(0, -1)}.`);
      return;
    }
    apply({ kind: 'create', collection, name });
    setNewName('');
  };
  const updateAlias = (reference: string) => {
    if (!activeAlias) return;
    const result = patchCatalogAlias(source, document.format, activeAlias, reference);
    setAliasError(result.error ?? '');
    if (!result.error) onChange(result.source);
  };
  const createAlias = () => {
    const reference = newAliasCatalog || catalogChoices[0]?.reference || '';
    const result = addCatalogAlias(source, document.format, newAliasName, reference);
    setAliasError(result.error ?? '');
    if (!result.error) {
      onChange(result.source);
      setNewAliasName('');
      setNewAliasCatalog('');
    }
  };
  const deleteAlias = (acceptImpact = false) => {
    if (!activeAlias) return;
    const result = deleteCatalogAlias(source, document.format, activeAlias, acceptImpact);
    setAliasError(result.error ?? '');
    if (!result.error) {
      onChange(result.source);
      setSelectedAlias('');
      setAliasImpact(null);
    }
  };
  const requestDeleteAlias = () => {
    if (!activeAlias) return;
    const references = catalogAliasReferenceDetails(source, document.format, activeAlias);
    if (references.length > 0) {
      setAliasImpact({ alias: activeAlias, references });
      return;
    }
    deleteAlias(true);
  };

  return (
    <section className="definition-editor" aria-labelledby="definition-editor-title">
      <div className="state-editor-heading">
        <div>
          <p className="eyebrow">Reusable definitions · source-preserving draft</p>
          <h3 id="definition-editor-title">Functions, events, and errors</h3>
          <p className="muted-copy">
            Rename and edit reusable definitions while updating references or blocking unsafe
            deletion. Existing extension fields remain untouched.
          </p>
        </div>
        <button className="button button-secondary" type="button" onClick={() => onOpenSource()}>
          Open source
        </button>
      </div>
      <div className="definition-tabs" role="tablist" aria-label="Reusable definition kinds">
        {collections.map((item) => (
          <button
            className={`button ${collection === item.key ? 'button-primary' : 'button-secondary'}`}
            key={item.key}
            type="button"
            role="tab"
            aria-selected={collection === item.key}
            onClick={() => {
              setCollection(item.key);
              setError(null);
            }}
          >
            {item.label} ({parseDefinitions(source, document.format, item.key).length})
          </button>
        ))}
      </div>
      <div className="definition-editor-layout">
        <div className="state-list" aria-label={`${collection} definitions`}>
          {definitions.map((definition, index) => (
            <button
              className={`state-list-item${index === actualIndex ? ' is-selected' : ''}`}
              key={`${definition.name}-${index}`}
              type="button"
              onClick={() => {
                setSelectedIndices((items) => ({ ...items, [collection]: index }));
                setError(null);
              }}
            >
              <strong>{definition.name}</strong>
              <span>{collection.slice(0, -1)}</span>
            </button>
          ))}
          {definitions.length === 0 && <p className="muted-copy">No {collection} are declared.</p>}
        </div>
        <div className="state-editor-detail">
          {selected ? (
            <>
              <div className="state-toolbar">
                <button
                  className="button button-secondary"
                  type="button"
                  onClick={() =>
                    apply({
                      kind: 'duplicate',
                      collection,
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
                  onClick={() =>
                    apply({ kind: 'move', collection, index: actualIndex, direction: 'up' })
                  }
                  disabled={actualIndex <= 0}
                >
                  Move up
                </button>
                <button
                  className="button button-secondary"
                  type="button"
                  onClick={() =>
                    apply({ kind: 'move', collection, index: actualIndex, direction: 'down' })
                  }
                  disabled={actualIndex < 0 || actualIndex >= definitions.length - 1}
                >
                  Move down
                </button>
                <button
                  className="button button-danger"
                  type="button"
                  onClick={() => apply({ kind: 'delete', collection, index: actualIndex })}
                >
                  Delete
                </button>
              </div>
              <label className="metadata-form-field">
                <span>Definition name</span>
                <input
                  value={selected.name}
                  onChange={(event) => {
                    const value = event.target.value.trim();
                    if (value && value !== selected.name)
                      apply({ kind: 'rename', collection, index: actualIndex, name: value });
                  }}
                />
                <small>Renaming updates all matching references in the workflow.</small>
              </label>
              {fields.map((field) => (
                <label className="metadata-form-field" key={field.key}>
                  <span>{field.label}</span>
                  {collection === 'functions' && field.key === 'operation' ? (
                    <>
                      <input
                        value={definitionFieldText(
                          source,
                          document.format,
                          collection,
                          actualIndex,
                          field.key,
                        )}
                        list="catalog-operation-options"
                        aria-label="Catalog operation picker"
                        onChange={(event) => {
                          const result = applyDefinitionField(
                            source,
                            document.format,
                            collection,
                            actualIndex,
                            field.key,
                            event.target.value,
                          );
                          setError(result.error);
                          if (!result.error) onChange(result.source);
                        }}
                      />
                      <datalist id="catalog-operation-options">
                        {operationOptions.map((option) => (
                          <option key={option.value} value={option.value} label={option.label} />
                        ))}
                      </datalist>
                      <small>
                        {operationOptions.length > 0
                          ? 'Search local catalog operations or keep an explicit reference.'
                          : 'Catalog operations are loading; explicit references remain editable.'}
                      </small>
                    </>
                  ) : (
                    <>
                      <input
                        value={definitionFieldText(
                          source,
                          document.format,
                          collection,
                          actualIndex,
                          field.key,
                        )}
                        onChange={(event) => {
                          const result = applyDefinitionField(
                            source,
                            document.format,
                            collection,
                            actualIndex,
                            field.key,
                            event.target.value,
                          );
                          setError(result.error);
                          if (!result.error) onChange(result.source);
                        }}
                      />
                      <small>{field.help}</small>
                    </>
                  )}
                </label>
              ))}
              <div className="definition-usage" aria-label="Definition usage">
                <strong>Usage count: {references.length}</strong>
                {references.length > 0 ? (
                  <ul>
                    {references.map((reference) => (
                      <li key={reference.label}>
                        <button
                          className="button button-link"
                          type="button"
                          onClick={() => onOpenSource(reference.line ?? undefined)}
                        >
                          {reference.label}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="muted-copy">No references detected; deletion is safe.</p>
                )}
              </div>
            </>
          ) : (
            <p className="muted-copy">
              Create the first {collection.slice(0, -1)} definition below.
            </p>
          )}
        </div>
      </div>
      <div className="state-create-panel">
        <strong>Create {collection.slice(0, -1)}</strong>
        <input
          aria-label={`New ${collection.slice(0, -1)} name`}
          placeholder={`New ${collection.slice(0, -1)} name`}
          value={newName}
          onChange={(event) => setNewName(event.target.value)}
        />
        <button className="button button-primary" type="button" onClick={create} disabled={saving}>
          Add {collection.slice(0, -1)}
        </button>
      </div>
      {error && (
        <p className="field-error state-editor-error" role="alert">
          {error}
        </p>
      )}
      <section className="definition-alias-editor" aria-labelledby="catalog-alias-title">
        <div className="state-editor-heading">
          <div>
            <h4 id="catalog-alias-title">Catalog aliases</h4>
            <p className="muted-copy">
              Select a local catalog file for each workflow-uri-definitions alias. Unresolved
              references remain available as explicit values.
            </p>
          </div>
        </div>
        {activeAlias ? (
          <div className="metadata-form-grid">
            <label className="metadata-form-field">
              <span>Selected catalog alias</span>
              <select
                value={activeAlias}
                aria-label="Selected catalog alias"
                onChange={(event) => {
                  setSelectedAlias(event.target.value);
                  setAliasError('');
                }}
              >
                {aliasNames.map((alias) => (
                  <option key={alias} value={alias}>
                    {alias}
                  </option>
                ))}
              </select>
            </label>
            <label className="metadata-form-field">
              <span>Catalog file</span>
              <select
                value={activeAliasReference}
                aria-label="Catalog file for alias"
                onChange={(event) => updateAlias(event.target.value)}
              >
                {!catalogChoices.some((choice) => choice.reference === activeAliasReference) && (
                  <option value={activeAliasReference}>{activeAliasReference} (unresolved)</option>
                )}
                {catalogChoices.map((choice) => (
                  <option key={choice.reference} value={choice.reference}>
                    {choice.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="catalog-inline-actions">
              <button className="button button-danger" type="button" onClick={requestDeleteAlias}>
                Delete catalog alias
              </button>
            </div>
          </div>
        ) : (
          <p className="muted-copy">No catalog aliases declared yet.</p>
        )}
        {aliasImpact && (
          <div className="catalog-inline-impact" role="dialog" aria-labelledby="alias-impact-title">
            <p className="eyebrow">Dependency impact review</p>
            <h4 id="alias-impact-title">Alias dependency impact</h4>
            <p>
              Deleting <code>{aliasImpact.alias}</code> will leave these workflow operation
              references unresolved:
            </p>
            <ul className="delete-impact-list">
              {aliasImpact.references.map((reference) => (
                <li key={`${reference.label}-${reference.line ?? 'json'}`}>
                  <code>{reference.label}</code>
                </li>
              ))}
            </ul>
            <div className="context-actions">
              <button
                className="button button-secondary"
                type="button"
                onClick={() => setAliasImpact(null)}
              >
                Keep alias
              </button>
              <button
                className="button button-danger"
                type="button"
                onClick={() => deleteAlias(true)}
              >
                Delete alias and accept impact
              </button>
            </div>
          </div>
        )}
        <div className="state-create-panel">
          <strong>Add catalog alias</strong>
          <input
            aria-label="New catalog alias name"
            placeholder="New catalog alias"
            value={newAliasName}
            onChange={(event) => setNewAliasName(event.target.value)}
          />
          <select
            aria-label="New catalog alias file"
            value={newAliasCatalog || catalogChoices[0]?.reference || ''}
            onChange={(event) => setNewAliasCatalog(event.target.value)}
            disabled={catalogChoices.length === 0}
          >
            {catalogChoices.length === 0 ? (
              <option value="">No local catalogs available</option>
            ) : (
              catalogChoices.map((choice) => (
                <option key={choice.reference} value={choice.reference}>
                  {choice.label}
                </option>
              ))
            )}
          </select>
          <button
            className="button button-primary"
            type="button"
            onClick={createAlias}
            disabled={catalogChoices.length === 0 || saving}
          >
            Add catalog alias
          </button>
        </div>
        {aliasError && (
          <p className="field-error state-editor-error" role="alert">
            {aliasError}
          </p>
        )}
      </section>
    </section>
  );
}

function catalogReferenceMatches(path: string, reference: string): boolean {
  const normalize = (value: string) =>
    value
      .replace(/^classpath:\//, '')
      .replace(/^workflows\//, '')
      .replace(/^src\/main\/resources\//, '')
      .replace(/^\//, '');
  const normalizedPath = normalize(path);
  const normalizedReference = normalize(reference);
  return (
    normalizedPath === normalizedReference ||
    normalizedPath.endsWith(`/${normalizedReference}`) ||
    normalizedReference.endsWith(`/${normalizedPath}`)
  );
}

function catalogReferenceForPath(path: string): string {
  const relative = path.replace(/^workflows\//, '').replace(/^\//, '');
  return `classpath:/${relative}`;
}
