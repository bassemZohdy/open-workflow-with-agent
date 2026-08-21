import { describe, expect, it } from 'vitest';

import { applyGraphLayout, loadGraphLayout, saveGraphLayout, snapToGrid } from './graph-layout';
import type { WorkflowGraph } from './graph';

const graph = {
  nodes: [
    {
      id: 'state:Start',
      kind: 'state',
      label: 'Start',
      stateType: 'inject',
      sourceLine: 1,
      sourceEndLine: 2,
      reachable: true,
      x: 34,
      y: 34,
      width: 218,
      height: 98,
      details: {
        conditions: [],
        defaultTransition: null,
        actions: [],
        eventRef: null,
        errors: [],
        terminal: false,
        fields: {},
      },
    },
  ],
  edges: [],
  startState: 'Start',
  warnings: [],
  supported: true,
} satisfies WorkflowGraph;

describe('graph layout persistence', () => {
  it('snaps positions to the alignment grid', () => {
    expect(snapToGrid(37)).toBe(48);
    expect(snapToGrid(46, 16)).toBe(48);
  });

  it('applies layout positions without changing graph semantics', () => {
    const positioned = applyGraphLayout(graph, { 'state:Start': { x: 120, y: 144 } });
    expect(positioned.nodes[0]).toMatchObject({ x: 120, y: 144 });
    expect(positioned.edges).toEqual(graph.edges);
    expect(positioned.warnings).toEqual(graph.warnings);
  });

  it('round-trips valid positions and ignores malformed storage entries', () => {
    const storage = new Map<string, string>();
    const adapter = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    } as unknown as Storage;
    saveGraphLayout(adapter, 'layout', { start: { x: 24, y: 48 } });
    expect(loadGraphLayout(adapter, 'layout')).toEqual({ start: { x: 24, y: 48 } });
    storage.set('layout', JSON.stringify({ start: { x: 'bad', y: 48 }, good: { x: 0, y: 24 } }));
    expect(loadGraphLayout(adapter, 'layout')).toEqual({ good: { x: 0, y: 24 } });
  });
});
