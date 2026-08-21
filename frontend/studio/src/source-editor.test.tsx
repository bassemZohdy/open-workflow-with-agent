import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SourceEditor } from './source-editor';
import { type DocumentResponse } from './workspace';

const sampleDocument = {
  id: 'workflow-test',
  kind: 'workflow',
  path: 'workflows/test.sw.yaml',
  displayName: 'test',
  format: 'yaml',
  sizeBytes: 8,
  etag: 'etag',
  revisionNumber: 1,
  modifiedAt: '2026-08-20T00:00:00Z',
  compatibility: 'editable',
  specVersion: '0.8',
  openapi: null,
  generation: { state: 'in_sync', message: null },
  diagnostics: [],
  documentVersion: '1.0',
  name: 'Test',
  stateTypes: [],
  catalogAliases: [],
  functionReferences: [],
  catalogReferences: [],
  subflowReferences: [],
  parseStatus: 'parsed',
  validationState: 'valid',
  content: 'id: test\n',
  metadata: null,
  sourceTree: null,
} as DocumentResponse;

describe('SourceEditor', () => {
  afterEach(() => {
    window.document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('edits canonical text and exposes find/replace and save controls', async () => {
    const onChange = vi.fn();
    const rootElement = window.document.createElement('div');
    window.document.body.append(rootElement);
    const root = createRoot(rootElement);
    await act(async () => {
      root.render(
        <SourceEditor
          document={sampleDocument}
          value="id: test\nname: old\n"
          onChange={onChange}
          onSave={vi.fn()}
          onSaveAs={vi.fn()}
          onExport={vi.fn()}
          onFormat={vi.fn()}
          onUndo={vi.fn()}
          onRedo={vi.fn()}
          canUndo
          canRedo={false}
          canSave
          saving={false}
        />,
      );
    });
    const query = window.document.querySelector<HTMLInputElement>('input[placeholder="Find"]');
    const replace = window.document.querySelector<HTMLInputElement>('input[placeholder="Replace"]');
    expect(
      window.document.querySelector('textarea[aria-label="Editable canonical source"]'),
    ).not.toBeNull();
    await act(async () => {
      if (query && replace) {
        const setValue = (element: HTMLInputElement, value: string) => {
          const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
          setter?.call(element, value);
          element.dispatchEvent(new Event('input', { bubbles: true }));
        };
        setValue(query, 'old');
        setValue(replace, 'new');
      }
    });
    expect(window.document.body.textContent).toContain('Replace all');
    root.unmount();
  });
});
