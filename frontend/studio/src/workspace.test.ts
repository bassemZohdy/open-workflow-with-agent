import { describe, expect, it } from 'vitest';

import {
  documentHref,
  documentIdFromLocation,
  documentMatches,
  type DocumentSummary,
} from './workspace';

const sample: DocumentSummary = {
  id: 'workflow-0123456789abcdef0123456789abcdef',
  kind: 'workflow',
  path: 'workflows/sub_flows/example.sw.yaml',
  displayName: 'example',
  format: 'yaml',
  sizeBytes: 128,
  etag: '"sha256:test"',
  revisionNumber: 1,
  modifiedAt: '2026-08-19T10:00:00Z',
  compatibility: 'editable',
  specVersion: '0.8',
  openapi: null,
  generation: { state: 'in_sync', message: null },
  diagnostics: [],
  documentVersion: '1.0',
  name: 'Example Workflow',
  stateTypes: ['operation', 'switch'],
  catalogAliases: ['demoCatalog'],
  functionReferences: ['demoCatalog#run'],
  catalogReferences: ['catalogs/demo.yaml'],
  subflowReferences: [],
  parseStatus: 'parsed',
  validationState: 'valid',
};

describe('workspace explorer helpers', () => {
  it('matches filters across name, id, version, state, catalog, and validation state', () => {
    const base = {
      kind: 'all' as const,
      version: 'all',
      stateType: 'all',
      catalog: 'all',
      validation: 'all' as const,
    };
    expect(documentMatches(sample, { ...base, query: 'Example Workflow' })).toBe(true);
    expect(documentMatches(sample, { ...base, query: sample.id })).toBe(true);
    expect(documentMatches(sample, { ...base, query: '0.8' })).toBe(true);
    expect(documentMatches(sample, { ...base, query: '', stateType: 'switch' })).toBe(true);
    expect(documentMatches(sample, { ...base, query: '', catalog: 'demoCatalog' })).toBe(true);
    expect(documentMatches(sample, { ...base, query: '', validation: 'unsupported' })).toBe(false);
    const marked = { ...sample, path: 'workflows/marked.sw.yaml', reusableSubflow: true };
    expect(documentMatches(marked, { ...base, query: '', reusableSubflow: true })).toBe(true);
    expect(
      documentMatches(
        { ...marked, reusableSubflow: false },
        { ...base, query: '', reusableSubflow: true },
      ),
    ).toBe(false);
  });

  it('creates stable kind-specific deep links and reads their IDs', () => {
    const href = documentHref(sample);
    expect(href).toBe('/studio/workflows/workflow-0123456789abcdef0123456789abcdef');
    expect(documentIdFromLocation({ pathname: href })).toBe(sample.id);
  });
});
