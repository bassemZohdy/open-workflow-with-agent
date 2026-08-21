import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { IssuesPanel } from './issues-panel';
import type { DocumentResponse } from './workspace';

const source = `specVersion: '0.8'
id: workflow
start: Decide
states:
  - name: Decide
    type: switch
    dataConditions:
      - condition: '\${ .ok }'
        transition: Done
  - name: Done
    type: inject
    end: true
`;

const workflowDocument: DocumentResponse = {
  id: 'workflow',
  kind: 'workflow',
  path: 'workflow.sw.yaml',
  displayName: 'workflow',
  format: 'yaml',
  sizeBytes: source.length,
  etag: 'etag',
  revisionNumber: 1,
  modifiedAt: '2026-01-01T00:00:00Z',
  compatibility: 'editable',
  specVersion: '0.8',
  openapi: null,
  generation: { state: 'in_sync', message: null },
  diagnostics: [
    {
      id: 'studio.workflow.switch-default',
      ruleId: 'studio.workflow.switch-default',
      phase: 'semantic',
      severity: 'warning',
      message: 'Switch has no default transition: Decide',
      explanation: 'Unmatched input has no explicit outcome.',
      suggestedResolution: 'Add defaultCondition.',
      primaryRange: null,
      relatedRanges: [],
      fieldPath: null,
      nodeId: null,
      provenance: 'local-analyzer',
      documentationUrl: null,
      suppressible: true,
    },
  ],
  documentVersion: null,
  name: 'workflow',
  workflowId: 'workflow',
  stateTypes: ['switch', 'inject'],
  catalogAliases: [],
  functionReferences: [],
  catalogReferences: [],
  subflowReferences: [],
  parseStatus: 'parsed',
  validationState: 'valid',
  content: source,
  metadata: null,
  sourceTree: null,
};

describe('IssuesPanel quick-fix workflow', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('shows a diff preview and applies only to the draft callback', async () => {
    const onApplyQuickFix = vi.fn();
    const rootElement = document.createElement('div');
    document.body.append(rootElement);
    const root = createRoot(rootElement);
    await act(async () => {
      root.render(
        <IssuesPanel
          documents={[workflowDocument]}
          onSelectDocument={vi.fn()}
          onSelectView={vi.fn()}
          onSourceLine={vi.fn()}
          activeDocument={workflowDocument}
          activeSource={source}
          onApplyQuickFix={onApplyQuickFix}
        />,
      );
    });

    const quickFix = [...rootElement.querySelectorAll('button')].find(
      (button) => button.textContent === 'Quick fix',
    );
    expect(quickFix).not.toBeUndefined();
    await act(async () => quickFix?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(rootElement.textContent).toContain('Apply to draft');
    expect(rootElement.textContent).toContain('defaultCondition');

    const apply = [...rootElement.querySelectorAll('button')].find(
      (button) => button.textContent === 'Apply to draft',
    );
    await act(async () => apply?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(onApplyQuickFix).toHaveBeenCalledWith(
      expect.stringContaining('defaultCondition'),
      'Add default transition to “Done”',
    );
    root.unmount();
  });
});
