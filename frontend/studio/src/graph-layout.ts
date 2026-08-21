import type { WorkflowGraph } from './graph';

export type LayoutPosition = { x: number; y: number };
export type GraphLayout = Record<string, LayoutPosition>;

export function snapToGrid(value: number, grid = 24): number {
  return Math.round(value / grid) * grid;
}

export function applyGraphLayout(graph: WorkflowGraph, layout: GraphLayout): WorkflowGraph {
  return {
    ...graph,
    nodes: graph.nodes.map((node) => {
      const position = layout[node.id];
      return position ? { ...node, x: position.x, y: position.y } : node;
    }),
  };
}

export function loadGraphLayout(storage: Storage | null, key: string): GraphLayout {
  if (!storage) return {};
  try {
    const parsed = JSON.parse(storage.getItem(key) ?? '{}') as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed).flatMap(([id, value]) => {
        if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
        const position = value as { x?: unknown; y?: unknown };
        return typeof position.x === 'number' &&
          Number.isFinite(position.x) &&
          typeof position.y === 'number' &&
          Number.isFinite(position.y)
          ? [[id, { x: position.x, y: position.y }]]
          : [];
      }),
    );
  } catch {
    return {};
  }
}

export function saveGraphLayout(storage: Storage | null, key: string, layout: GraphLayout): void {
  if (!storage) return;
  try {
    if (Object.keys(layout).length === 0) storage.removeItem(key);
    else storage.setItem(key, JSON.stringify(layout));
  } catch {
    // Layout persistence is best-effort and must never block document editing.
  }
}
