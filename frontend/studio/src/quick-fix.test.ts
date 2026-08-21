import { describe, expect, it } from 'vitest';

import { quickFixesFor } from './quick-fix';
import type { Diagnostic, DocumentSummary } from './workspace';

const document = (format: 'yaml' | 'json' = 'yaml'): DocumentSummary => ({
  id: 'workflow',
  kind: 'workflow',
  path: 'workflow.sw.yaml',
  displayName: 'workflow',
  format,
  sizeBytes: 1,
  etag: 'etag',
  revisionNumber: 1,
  modifiedAt: '2026-01-01T00:00:00Z',
  compatibility: 'editable',
  specVersion: '0.8',
  openapi: null,
  generation: { state: 'in_sync', message: null },
  diagnostics: [],
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
});

function diagnostic(ruleId: string, message: string): Diagnostic {
  return {
    id: ruleId,
    ruleId,
    phase: 'semantic',
    severity: 'warning',
    message,
    explanation: message,
    suggestedResolution: null,
    primaryRange: null,
    relatedRanges: [],
    fieldPath: null,
    nodeId: null,
    provenance: 'local-analyzer',
    documentationUrl: null,
    suppressible: true,
  };
}

const switchSource = `specVersion: '0.8'
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

describe('quickFixesFor', () => {
  it('adds a default only when one terminal target makes the choice unambiguous', () => {
    const [fix] = quickFixesFor(
      document(),
      diagnostic('studio.workflow.switch-default', 'Switch has no default transition: Decide'),
      switchSource,
    );
    expect(fix?.source).toContain('defaultCondition: {"transition":"Done"}');
    expect(fix?.multiLocation).toBe(false);
  });

  it('renames only the later duplicate when it has no self-reference', () => {
    const source = `${switchSource.replace('start: Decide', 'start: First').replace('name: Decide', 'name: First')}  - name: First
    type: inject
    end: true
`;
    const [fix] = quickFixesFor(
      document(),
      diagnostic('studio.workflow.duplicate-state', 'Workflow state names must be unique: First'),
      source,
    );
    expect(fix?.source).toContain("- name: 'First (2)'");
    expect(fix?.source).toContain('- name: First');
  });

  it('removes an unreachable state through the existing guarded state patcher', () => {
    const source = `${switchSource}  - name: Unused
    type: inject
    end: true
`;
    const [fix] = quickFixesFor(
      document(),
      diagnostic(
        'studio.workflow.unreachable-state',
        'State is unreachable from workflow start: Unused',
      ),
      source,
    );
    expect(fix?.source).not.toContain('Unused');
  });

  it('previews removal of branches after an unconditional condition', () => {
    const source = `${switchSource
      .replace("condition: '\${ .ok }'", "condition: '\${ true }'")
      .replace(
        '  - name: Done',
        `      - condition: '\${ .later }'
        transition: Done
  - name: Done`,
      )}`;
    const [fix] = quickFixesFor(
      document(),
      diagnostic(
        'studio.workflow.unreachable-branch',
        'A switch branch is always true, so later branches are unreachable: Decide',
      ),
      source,
    );
    expect(fix?.multiLocation).toBe(true);
    expect(fix?.source).not.toContain('.later');
  });

  it('repairs a uniquely normalized broken rename across references', () => {
    const source = switchSource
      .replace('transition: Done', 'transition: Do-This')
      .replace('  - name: Done', '  - name: DoThis');
    const [fix] = quickFixesFor(
      document(),
      diagnostic(
        'studio.workflow.transition-reference',
        'Transition target does not exist: Do-This',
      ),
      source,
    );
    expect(fix?.source).toContain("transition: 'DoThis'");
    expect(fix?.multiLocation).toBe(true);
  });
});
