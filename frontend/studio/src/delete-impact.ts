export type DependencyImpact = { documentId: string; path: string };

export function dependencyImpact(value: unknown): DependencyImpact[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const candidate = item as Record<string, unknown>;
    return typeof candidate.documentId === 'string' && typeof candidate.path === 'string'
      ? [{ documentId: candidate.documentId, path: candidate.path }]
      : [];
  });
}
