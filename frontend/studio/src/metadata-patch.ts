import type { DocumentResponse } from './workspace';

export type MetadataField =
  | 'id'
  | 'name'
  | 'description'
  | 'version'
  | 'specVersion'
  | 'expressionLang'
  | 'start'
  | 'keepActive'
  | 'timeouts'
  | 'constants'
  | 'annotations'
  | 'extensions';

export type MetadataChanges = Partial<Record<MetadataField, unknown>>;

export function patchMetadataSource(
  source: string,
  format: DocumentResponse['format'],
  changes: MetadataChanges,
): string {
  if (format === 'json') return patchJson(source, changes);
  const lines = source.split(/\r?\n/);
  const replacements = Object.entries(changes).filter(([, value]) => value !== undefined);
  for (const [key, value] of replacements) {
    const start = lines.findIndex((line) => topLevelKey(line) === key);
    if (start >= 0) {
      let end = start + 1;
      while (end < lines.length && !isTopLevelContent(lines[end] ?? '')) end += 1;
      const rendered = value === null ? [] : [`${key}: ${yamlValue(value)}`];
      lines.splice(start, end - start, ...rendered);
    } else if (value !== null) {
      lines.splice(insertionPoint(lines), 0, `${key}: ${yamlValue(value)}`);
    }
  }
  return lines.join('\n');
}

export function scalarMetadataFromSource(
  document: DocumentResponse,
  source: string,
  key: MetadataField,
): string {
  if (document.format === 'json') {
    try {
      const value = JSON.parse(source) as Record<string, unknown>;
      const raw = value[key];
      return typeof raw === 'string' || typeof raw === 'boolean' || typeof raw === 'number'
        ? String(raw)
        : '';
    } catch {
      return '';
    }
  }
  const lines = source.split(/\r?\n/);
  const index = lines.findIndex((entry) => topLevelKey(entry) === key);
  if (index < 0) return '';
  const raw = lines[index]?.slice(lines[index].indexOf(':') + 1).trim() ?? '';
  if (/^(?:[>|][+-]?)$/.test(raw)) {
    const continuation: string[] = [];
    for (const line of lines.slice(index + 1)) {
      if (isTopLevelContent(line)) break;
      if (line.trim()) continuation.push(line.trim());
    }
    return continuation.join(' ');
  }
  return unquoteYaml(raw);
}

export function structuredMetadataText(
  document: DocumentResponse,
  source: string,
  key: MetadataField,
): string {
  if (document.format === 'json') {
    try {
      const root = JSON.parse(source) as Record<string, unknown>;
      return root[key] === undefined ? '{}' : JSON.stringify(root[key], null, 2);
    } catch {
      return '{}';
    }
  }
  const lines = source.split(/\r?\n/);
  const index = lines.findIndex((entry) => topLevelKey(entry) === key);
  if (index < 0) return '{}';
  const raw = lines[index]?.slice(lines[index].indexOf(':') + 1).trim() ?? '';
  if (raw && !/^[>|][+-]?$/.test(raw)) return raw;
  const body: string[] = [];
  for (const line of lines.slice(index + 1)) {
    if (isTopLevelContent(line)) break;
    body.push(line);
  }
  const nonEmpty = body.filter((line) => line.trim());
  if (nonEmpty.length === 0) return raw || '{}';
  const indent = Math.min(...nonEmpty.map((line) => line.match(/^\s*/)?.[0].length ?? 0));
  return body
    .map((line) => (line.length >= indent ? line.slice(indent) : line))
    .join('\n')
    .trim();
}

export function topLevelKeysFromSource(
  source: string,
  format: DocumentResponse['format'],
): string[] {
  if (format === 'json') {
    try {
      const root = JSON.parse(source) as unknown;
      return root && typeof root === 'object' && !Array.isArray(root)
        ? Object.keys(root as Record<string, unknown>)
        : [];
    } catch {
      return [];
    }
  }
  return [
    ...new Set(
      source
        .split(/\r?\n/)
        .map(topLevelKey)
        .filter((key): key is string => key !== null),
    ),
  ];
}

function patchJson(source: string, changes: MetadataChanges): string {
  let root: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(source);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return source;
    root = parsed as Record<string, unknown>;
  } catch {
    return source;
  }
  for (const [key, value] of Object.entries(changes)) {
    if (value === null) delete root[key];
    else if (value !== undefined) root[key] = value;
  }
  return `${JSON.stringify(root, null, 2)}\n`;
}

function insertionPoint(lines: string[]): number {
  const preferred = new Set([
    'start',
    'states',
    'events',
    'extensions',
    'errors',
    'functions',
    'timeouts',
    'constants',
    'annotations',
  ]);
  const index = lines.findIndex((line) => {
    const key = topLevelKey(line);
    return key !== null && preferred.has(key);
  });
  return index < 0 ? Math.max(0, lines.length - (lines.at(-1) === '' ? 1 : 0)) : index;
}

function isTopLevelContent(line: string): boolean {
  if (line.trim() === '' || line.startsWith(' ') || line.startsWith('\t')) return false;
  if (line.trimStart().startsWith('#')) return true;
  return topLevelKey(line) !== null;
}

function topLevelKey(line: string): string | null {
  if (line.startsWith(' ') || line.startsWith('\t') || line.trimStart().startsWith('#'))
    return null;
  const match = line.match(/^([A-Za-z][A-Za-z0-9_-]*):(?:\s|$)/);
  return match?.[1] ?? null;
}

function yamlValue(value: unknown): string {
  if (typeof value === 'string') return `'${value.replaceAll("'", "''").replace(/[\r\n]+/g, ' ')}'`;
  if (typeof value === 'boolean' || typeof value === 'number') return String(value);
  return JSON.stringify(value);
}

function unquoteYaml(value: string): string {
  if (value.startsWith("'") && value.endsWith("'")) return value.slice(1, -1).replaceAll("''", "'");
  if (value.startsWith('"') && value.endsWith('"')) {
    try {
      return JSON.parse(value) as string;
    } catch {
      return value.slice(1, -1);
    }
  }
  return value;
}
