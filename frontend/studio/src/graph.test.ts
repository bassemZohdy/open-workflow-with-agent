import { describe, expect, it } from 'vitest';

import { buildWorkflowGraph, stateId } from './graph';
import type { DocumentResponse } from './workspace';

const document = (sourceTree: Record<string, unknown>, content: string): DocumentResponse => ({
  id: 'workflow-test',
  kind: 'workflow',
  path: 'workflows/test.sw.yaml',
  displayName: 'test',
  format: 'yaml',
  sizeBytes: content.length,
  etag: '"sha256:test"',
  revisionNumber: 1,
  modifiedAt: '2026-08-19T10:00:00Z',
  compatibility: 'editable',
  specVersion: '0.8',
  openapi: null,
  generation: { state: 'in_sync', message: null },
  diagnostics: [],
  documentVersion: '1.0',
  name: 'Test',
  stateTypes: ['switch', 'operation', 'callback', 'inject'],
  catalogAliases: [],
  functionReferences: [],
  catalogReferences: [],
  subflowReferences: [],
  parseStatus: 'parsed',
  validationState: 'valid',
  content,
  metadata: null,
  sourceTree,
});

describe('workflow graph projection', () => {
  it('projects start, typed states, conditions, callback waits, terminal outcomes, and actions', () => {
    const content = `start: Start\nstates:\n  - name: Start\n    type: switch\n    dataConditions:\n      - condition: ok\n        transition: Run\n    defaultCondition:\n      transition: Fail\n  - name: Run\n    type: operation\n    actions:\n      - name: Invoke\n        functionRef:\n          refName: demoCall\n    transition: Wait\n  - name: Wait\n    type: callback\n    eventRef: completed\n    end: true\n  - name: Fail\n    type: inject\n    end: true\n`;
    const graph = buildWorkflowGraph(
      document(
        {
          start: 'Start',
          states: [
            {
              name: 'Start',
              type: 'switch',
              dataConditions: [{ condition: 'ok', transition: 'Run' }],
              defaultCondition: { transition: 'Fail' },
            },
            {
              name: 'Run',
              type: 'operation',
              actions: [{ name: 'Invoke', functionRef: { refName: 'demoCall' } }],
              transition: 'Wait',
            },
            {
              name: 'Wait',
              type: 'callback',
              action: { name: 'Await callback', functionRef: { refName: 'fireAsync' } },
              eventRef: 'completed',
              end: true,
            },
            { name: 'Fail', type: 'inject', end: true },
          ],
        },
        content,
      ),
    );

    expect(graph.supported).toBe(true);
    expect(graph.warnings).toEqual([]);
    expect(graph.nodes.map((node) => node.stateType)).toEqual(
      expect.arrayContaining(['switch', 'operation', 'callback', 'inject']),
    );
    expect(graph.edges.map((edge) => edge.kind)).toEqual(
      expect.arrayContaining(['start', 'conditional', 'default', 'transition', 'terminal']),
    );
    expect(graph.nodes.find((node) => node.id === stateId('Wait'))?.details.eventRef).toBe(
      'completed',
    );
    expect(graph.nodes.find((node) => node.id === stateId('Wait'))?.details.actions).toEqual([
      'Await callback · fireAsync',
    ]);
    expect(graph.nodes.find((node) => node.id === stateId('Run'))?.details.actions).toEqual([
      'Invoke · demoCall',
    ]);
    expect(graph.edges.every((edge) => edge.sourceLine !== null)).toBe(true);
  });

  it('keeps unknown targets visible and reports unreachable states without dropping edges', () => {
    const content = `start: Start\nstates:\n  - name: Start\n    type: mystery\n    transition: Missing\n  - name: Orphan\n    type: future\n    end: true\n`;
    const graph = buildWorkflowGraph(
      document(
        {
          start: 'Start',
          states: [
            { name: 'Start', type: 'mystery', transition: 'Missing' },
            { name: 'Orphan', type: 'future', end: true },
          ],
        },
        content,
      ),
    );

    expect(graph.nodes.find((node) => node.kind === 'missing')?.label).toBe('Missing');
    expect(graph.edges.some((edge) => edge.to === stateId('Missing'))).toBe(true);
    expect(graph.nodes.find((node) => node.label === 'Orphan')?.reachable).toBe(false);
    expect(graph.warnings.join(' ')).toContain('unreachable');
    expect(graph.warnings.join(' ')).toContain('missing state');
  });

  it('keeps a missing start target visible as a generic node', () => {
    const content = 'start: NotThere\nstates:\n  - name: Orphan\n    type: inject\n';
    const graph = buildWorkflowGraph(
      document({ start: 'NotThere', states: [{ name: 'Orphan', type: 'inject' }] }, content),
    );

    expect(graph.nodes.find((node) => node.id === stateId('NotThere'))?.kind).toBe('missing');
    expect(graph.edges.find((edge) => edge.kind === 'start')?.to).toBe(stateId('NotThere'));
    expect(graph.warnings.join(' ')).toContain('start targets missing');
  });

  it('projects a direct connection from the active draft source', () => {
    const canonical = `start: Start\nstates:\n  - name: Start\n    type: inject\n  - name: Finish\n    type: inject\n    end: true\n`;
    const graph = buildWorkflowGraph(
      document(
        {
          start: 'Start',
          states: [
            { name: 'Start', type: 'inject' },
            { name: 'Finish', type: 'inject', end: true },
          ],
        },
        canonical,
      ),
      canonical.replace(
        '    type: inject\n  - name: Finish',
        '    type: inject\n    transition: Finish\n  - name: Finish',
      ),
    );

    expect(graph.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          from: stateId('Start'),
          to: stateId('Finish'),
          kind: 'transition',
        }),
      ]),
    );
  });

  it('uses the active YAML draft for state inventory and start relationships', () => {
    const canonical = `start: Start\nstates:\n  - name: Start\n    type: inject\n    transition: Finish\n  - name: Finish\n    type: inject\n    end: true\n`;
    const draft = `start: Added\nstates:\n  - name: Start\n    type: inject\n    transition: Added\n  - name: Added\n    type: sleep\n    end: true\n`;
    const graph = buildWorkflowGraph(
      document(
        {
          start: 'Start',
          states: [
            { name: 'Start', type: 'inject', transition: 'Finish' },
            { name: 'Finish', type: 'inject', end: true },
          ],
        },
        canonical,
      ),
      draft,
    );

    expect(graph.nodes.some((node) => node.label === 'Finish')).toBe(false);
    expect(graph.nodes.find((node) => node.label === 'Added')?.stateType).toBe('sleep');
    expect(graph.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'start', to: stateId('Added') }),
        expect.objectContaining({ from: stateId('Start'), to: stateId('Added') }),
      ]),
    );
  });
});
