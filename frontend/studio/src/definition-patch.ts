import type { DocumentResponse } from './workspace';

export type DefinitionKind = 'functions' | 'events' | 'errors';
export type DefinitionSummary = {
  kind: DefinitionKind;
  index: number;
  name: string;
  startLine: number | null;
  endLine: number | null;
};
export type DefinitionOperation =
  | { kind: 'create'; collection: DefinitionKind; name: string }
  | { kind: 'duplicate'; collection: DefinitionKind; index: number; name: string }
  | { kind: 'rename'; collection: DefinitionKind; index: number; name: string }
  | { kind: 'delete'; collection: DefinitionKind; index: number }
  | { kind: 'move'; collection: DefinitionKind; index: number; direction: 'up' | 'down' };
export type DefinitionPatchResult = { source: string; error: string | null };
export type DefinitionReference = { label: string; line: number | null };

export function catalogAliasDefinitions(
  source: string,
  format: DocumentResponse['format'],
): Record<string, string> {
  if (format === 'json') {
    try {
      const root = JSON.parse(source) as Record<string, unknown>;
      const aliases: Record<string, string> = {};
      const extensions = Array.isArray(root.extensions) ? root.extensions : [];
      for (const extension of extensions) {
        if (!isRecord(extension) || extension.extensionid !== 'workflow-uri-definitions') continue;
        const definitions = isRecord(extension.definitions) ? extension.definitions : {};
        for (const [alias, value] of Object.entries(definitions)) {
          if (typeof value === 'string') aliases[alias] = value;
        }
      }
      return aliases;
    } catch {
      return {};
    }
  }
  const lines = source.split(/\r?\n/);
  const aliases: Record<string, string> = {};
  let definitionsIndent: number | null = null;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === 'definitions:') {
      definitionsIndent = indentation(line);
      continue;
    }
    if (definitionsIndent === null || trimmed === '' || trimmed.startsWith('#')) continue;
    const currentIndent = indentation(line);
    if (currentIndent <= definitionsIndent) {
      definitionsIndent = null;
      continue;
    }
    const match = line.match(/^\s{2,}([^:#][^:]*):\s*(.+?)\s*$/);
    if (match && currentIndent === definitionsIndent + 2) {
      aliases[unquote(match[1]?.trim() ?? '')] = unquote(match[2] ?? '');
    }
  }
  return aliases;
}

export function patchCatalogAlias(
  source: string,
  format: DocumentResponse['format'],
  alias: string,
  reference: string,
): DefinitionPatchResult {
  const name = alias.trim();
  const value = reference.trim();
  if (!name || !value) return { source, error: 'Catalog alias and file reference are required.' };
  if (format === 'json') {
    try {
      const parsed = JSON.parse(source) as unknown;
      if (!isRecord(parsed)) return { source, error: 'The JSON document root is not an object.' };
      const definitions = workflowDefinitions(parsed);
      if (!definitions || definitions[name] === undefined) {
        return { source, error: `Catalog alias ${name} no longer exists.` };
      }
      definitions[name] = value;
      return { source: `${JSON.stringify(parsed, null, 2)}\n`, error: null };
    } catch {
      return { source, error: 'Fix the JSON parse error before editing catalog aliases.' };
    }
  }
  const lines = source.split(/\r?\n/);
  const block = yamlDefinitionsBlock(lines);
  if (!block) return { source, error: 'This workflow has no workflow-uri-definitions block.' };
  const aliasLine = yamlAliasLine(lines, block, name);
  if (aliasLine < 0) return { source, error: `Catalog alias ${name} no longer exists.` };
  lines[aliasLine] = `${' '.repeat(block.indent + 2)}${yamlKey(name)}: ${yamlScalar(value)}`;
  return { source: lines.join('\n'), error: null };
}

export function catalogAliasReferenceDetails(
  source: string,
  format: DocumentResponse['format'],
  alias: string,
): DefinitionReference[] {
  const name = alias.trim();
  if (!name) return [];
  const prefix = `${name}#`;
  if (format === 'json') {
    try {
      const root = JSON.parse(source) as unknown;
      const references: DefinitionReference[] = [];
      const visit = (value: unknown, path: string): void => {
        if (Array.isArray(value)) {
          value.forEach((item, index) => visit(item, `${path}[${index}]`));
          return;
        }
        if (!isRecord(value)) return;
        Object.entries(value).forEach(([key, child]) => {
          const childPath = `${path}.${key}`;
          if (key === 'operation' && typeof child === 'string' && child.startsWith(prefix)) {
            references.push({ label: `operation at ${childPath}`, line: null });
          }
          visit(child, childPath);
        });
      };
      visit(root, '$');
      return references;
    } catch {
      return [];
    }
  }
  return source.split(/\r?\n/).flatMap((line, index) => {
    const match = line.match(/^\s*operation\s*:\s*(.*?)\s*$/);
    return match && unquote(match[1] ?? '').startsWith(prefix)
      ? [{ label: `operation on line ${index + 1}`, line: index + 1 }]
      : [];
  });
}

export function deleteCatalogAlias(
  source: string,
  format: DocumentResponse['format'],
  alias: string,
  acceptImpact = false,
): DefinitionPatchResult {
  const name = alias.trim();
  if (!name) return { source, error: 'Catalog alias is required.' };
  const references = catalogAliasReferenceDetails(source, format, name);
  if (references.length > 0 && !acceptImpact) {
    return {
      source,
      error: `Cannot delete catalog alias ${name}: ${references
        .slice(0, 3)
        .map((reference) => reference.label)
        .join(', ')} still reference it.`,
    };
  }
  if (format === 'json') {
    try {
      const parsed = JSON.parse(source) as unknown;
      if (!isRecord(parsed)) return { source, error: 'The JSON document root is not an object.' };
      const definitions = workflowDefinitions(parsed);
      if (!definitions || definitions[name] === undefined) {
        return { source, error: `Catalog alias ${name} no longer exists.` };
      }
      delete definitions[name];
      return { source: `${JSON.stringify(parsed, null, 2)}\n`, error: null };
    } catch {
      return { source, error: 'Fix the JSON parse error before deleting catalog aliases.' };
    }
  }
  const lines = source.split(/\r?\n/);
  const block = yamlDefinitionsBlock(lines);
  if (!block) return { source, error: 'This workflow has no workflow-uri-definitions block.' };
  const aliasLine = yamlAliasLine(lines, block, name);
  if (aliasLine < 0) return { source, error: `Catalog alias ${name} no longer exists.` };
  lines.splice(aliasLine, 1);
  return { source: lines.join('\n'), error: null };
}

export function addCatalogAlias(
  source: string,
  format: DocumentResponse['format'],
  alias: string,
  reference: string,
): DefinitionPatchResult {
  const name = alias.trim();
  const value = reference.trim();
  if (!name || !value) return { source, error: 'Catalog alias and file reference are required.' };
  if (format === 'json') {
    try {
      const parsed = JSON.parse(source) as unknown;
      if (!isRecord(parsed)) return { source, error: 'The JSON document root is not an object.' };
      const definitions = workflowDefinitions(parsed, true);
      if (!definitions) return { source, error: 'Unable to create workflow-uri-definitions.' };
      if (definitions[name] !== undefined)
        return { source, error: `Catalog alias ${name} already exists.` };
      definitions[name] = value;
      return { source: `${JSON.stringify(parsed, null, 2)}\n`, error: null };
    } catch {
      return { source, error: 'Fix the JSON parse error before adding a catalog alias.' };
    }
  }
  const lines = source.split(/\r?\n/);
  const block = yamlDefinitionsBlock(lines);
  if (block) {
    if (yamlAliasLine(lines, block, name) >= 0) {
      return { source, error: `Catalog alias ${name} already exists.` };
    }
    lines.splice(
      block.end,
      0,
      `${' '.repeat(block.indent + 2)}${yamlKey(name)}: ${yamlScalar(value)}`,
    );
    return { source: lines.join('\n'), error: null };
  }
  const extensionLine = lines.findIndex((line) => /^extensions\s*:/.test(line));
  const extensionEnd = extensionLine < 0 ? -1 : findNextTopLevel(lines, extensionLine);
  const rendered = [
    '  - extensionid: workflow-uri-definitions',
    '    definitions:',
    `      ${yamlKey(name)}: ${yamlScalar(value)}`,
  ];
  if (extensionLine >= 0 && lines[extensionLine]?.trim() === 'extensions: []') {
    lines.splice(extensionLine, 1, 'extensions:', ...rendered);
  } else if (extensionLine >= 0) {
    lines.splice(extensionEnd, 0, ...rendered);
  } else {
    const insertAt = lines.findIndex((line) => /^states\s*:/.test(line));
    lines.splice(insertAt < 0 ? lines.length : insertAt, 0, 'extensions:', ...rendered);
  }
  return { source: lines.join('\n'), error: null };
}

export function parseDefinitions(
  source: string,
  format: DocumentResponse['format'],
  collection: DefinitionKind,
): DefinitionSummary[] {
  if (format === 'json') {
    try {
      const root = JSON.parse(source) as Record<string, unknown>;
      const values = Array.isArray(root[collection]) ? root[collection] : [];
      return values.flatMap((value, index) => {
        if (!isRecord(value) || typeof value.name !== 'string') return [];
        return [{ kind: collection, index, name: value.name, startLine: null, endLine: null }];
      });
    } catch {
      return [];
    }
  }
  const lines = source.split(/\r?\n/);
  const collectionLine = lines.findIndex((line) => line === `${collection}:`);
  if (collectionLine < 0) return [];
  const items: Array<{ line: number; indent: number; name: string }> = [];
  let itemIndent: number | null = null;
  for (let line = collectionLine + 1; line < lines.length; line += 1) {
    if (isTopLevelLine(lines[line] ?? '')) break;
    const match = (lines[line] ?? '').match(/^(\s*)-\s+name\s*:\s*(.+?)\s*$/);
    if (!match) continue;
    const indent = match[1]?.length ?? 0;
    if (itemIndent === null) itemIndent = indent;
    if (indent === itemIndent) items.push({ line, indent, name: unquote(match[2] ?? '') });
  }
  return items.map((item, index) => ({
    kind: collection,
    index,
    name: item.name,
    startLine: item.line + 1,
    endLine: items[index + 1]?.line ?? findNextTopLevel(lines, item.line),
  }));
}

export function definitionFieldText(
  source: string,
  format: DocumentResponse['format'],
  collection: DefinitionKind,
  index: number,
  key: string,
): string {
  if (format === 'json') {
    try {
      const root = JSON.parse(source) as Record<string, unknown>;
      const values = Array.isArray(root[collection]) ? root[collection] : [];
      const value = values[index];
      if (!isRecord(value) || value[key] === undefined) return '';
      return typeof value[key] === 'string'
        ? (value[key] as string)
        : JSON.stringify(value[key], null, 2);
    } catch {
      return '';
    }
  }
  const block = yamlBlocks(source, collection)[index];
  if (!block) return '';
  const lines = source.split(/\r?\n/);
  const field = directFieldIndex(lines, block.start, block.endExclusive, block.indent, key);
  if (field < 0) return '';
  const raw = lines[field]?.slice((lines[field] ?? '').indexOf(':') + 1).trim() ?? '';
  return unquote(raw);
}

export function applyDefinitionField(
  source: string,
  format: DocumentResponse['format'],
  collection: DefinitionKind,
  index: number,
  key: string,
  value: string,
): DefinitionPatchResult {
  const trimmed = value.trim();
  if (format === 'json') {
    try {
      const parsed = JSON.parse(source) as unknown;
      if (!isRecord(parsed)) return { source, error: 'The JSON document root is not an object.' };
      const values = Array.isArray(parsed[collection]) ? parsed[collection] : [];
      const definition = values[index];
      if (!isRecord(definition)) return { source, error: 'Select a valid definition first.' };
      if (!trimmed) delete definition[key];
      else definition[key] = parseSimpleValue(trimmed);
      parsed[collection] = values;
      return { source: `${JSON.stringify(parsed, null, 2)}\n`, error: null };
    } catch {
      return { source, error: 'Fix the JSON parse error before editing definitions.' };
    }
  }
  const block = yamlBlocks(source, collection)[index];
  if (!block) return { source, error: 'Select a valid definition first.' };
  const lines = source.split(/\r?\n/);
  const field = directFieldIndex(lines, block.start, block.endExclusive, block.indent, key);
  const fieldIndent = block.indent + 2;
  const rendered = trimmed ? [`${' '.repeat(fieldIndent)}${key}: ${yamlScalar(trimmed)}`] : [];
  if (field >= 0)
    lines.splice(
      field,
      nextDirectField(lines, field + 1, block.endExclusive, fieldIndent) - field,
      ...rendered,
    );
  else if (trimmed) lines.splice(block.start + 1, 0, ...rendered);
  return { source: lines.join('\n'), error: null };
}

export function applyDefinitionOperation(
  source: string,
  format: DocumentResponse['format'],
  operation: DefinitionOperation,
): DefinitionPatchResult {
  if (format === 'json') return applyJsonOperation(source, operation);
  const blocks = yamlBlocks(source, operation.collection);
  const requestedName =
    operation.kind === 'create' || operation.kind === 'duplicate' || operation.kind === 'rename'
      ? operation.name
      : null;
  if (requestedName !== null && !requestedName.trim())
    return { source, error: 'Definition names cannot be empty.' };
  if (
    requestedName !== null &&
    blocks.some(
      (block) =>
        block.name === requestedName &&
        block.index !== ('index' in operation ? operation.index : -1),
    )
  )
    return {
      source,
      error: `A ${singular(operation.collection)} named “${requestedName}” already exists.`,
    };
  if (operation.kind === 'create') return createYamlDefinition(source, operation);
  const selected = blocks[operation.index];
  if (!selected) return { source, error: 'Select a definition first.' };
  if (operation.kind === 'rename') {
    let next = replaceYamlName(source, selected.start, selected.indent, operation.name);
    next = replaceDefinitionReferences(
      next,
      format,
      operation.collection,
      selected.name,
      operation.name,
    );
    return { source: next, error: null };
  }
  if (operation.kind === 'delete') {
    const references = definitionReferences(source, format, operation.collection, selected.name);
    if (references.length > 0)
      return {
        source,
        error: `Cannot delete “${selected.name}”: ${references.slice(0, 3).join(', ')} still reference it.`,
      };
    const lines = source.split(/\r?\n/);
    lines.splice(selected.start, selected.endExclusive - selected.start);
    return { source: lines.join('\n'), error: null };
  }
  if (operation.kind === 'duplicate') {
    const lines = source.split(/\r?\n/);
    const copy = lines
      .slice(selected.start, selected.endExclusive)
      .map((line, offset) =>
        offset === 0 ? replaceNameAtLine(line, selected.indent, operation.name) : line,
      );
    lines.splice(selected.endExclusive, 0, ...copy);
    return { source: lines.join('\n'), error: null };
  }
  const targetIndex = operation.direction === 'up' ? operation.index - 1 : operation.index + 1;
  const target = blocks[targetIndex];
  if (!target) return { source, error: null };
  const lines = source.split(/\r?\n/);
  const selectedLines = lines.slice(selected.start, selected.endExclusive);
  const targetLines = lines.slice(target.start, target.endExclusive);
  const first = Math.min(selected.start, target.start);
  const last = Math.max(selected.endExclusive, target.endExclusive);
  lines.splice(
    first,
    last - first,
    ...(operation.direction === 'up'
      ? [...selectedLines, ...targetLines]
      : [...targetLines, ...selectedLines]),
  );
  return { source: lines.join('\n'), error: null };
}

export function definitionReferenceLabels(
  source: string,
  format: DocumentResponse['format'],
  collection: DefinitionKind,
  name: string,
): string[] {
  return definitionReferences(source, format, collection, name);
}

export function definitionReferenceDetails(
  source: string,
  format: DocumentResponse['format'],
  collection: DefinitionKind,
  name: string,
): DefinitionReference[] {
  return definitionReferences(source, format, collection, name).map((label) => {
    const match = label.match(/ on line (\d+)$/);
    return { label, line: match ? Number(match[1]) : null };
  });
}

function applyJsonOperation(source: string, operation: DefinitionOperation): DefinitionPatchResult {
  let root: Record<string, unknown>;
  try {
    const parsed = JSON.parse(source) as unknown;
    if (!isRecord(parsed)) return { source, error: 'The JSON document root is not an object.' };
    root = parsed;
  } catch {
    return { source, error: 'Fix the JSON parse error before editing definitions.' };
  }
  const rawValues = root[operation.collection];
  const values: Array<Record<string, unknown>> = Array.isArray(rawValues)
    ? rawValues.filter(isRecord)
    : [];
  const names = values.map((value, index) =>
    typeof value.name === 'string' ? value.name : `Unnamed ${index + 1}`,
  );
  const requestedName =
    operation.kind === 'create' || operation.kind === 'duplicate' || operation.kind === 'rename'
      ? operation.name
      : null;
  if (requestedName !== null && !requestedName.trim())
    return { source, error: 'Definition names cannot be empty.' };
  if (
    requestedName !== null &&
    names.some(
      (name, index) =>
        name === requestedName && index !== ('index' in operation ? operation.index : -1),
    )
  )
    return {
      source,
      error: `A ${singular(operation.collection)} named “${requestedName}” already exists.`,
    };
  if (operation.kind === 'create')
    values.push(createJsonDefinition(operation.collection, operation.name));
  else {
    const selected = values[operation.index];
    if (!selected) return { source, error: 'Select a definition first.' };
    if (operation.kind === 'rename') {
      selected.name = operation.name;
      replaceJsonReferences(
        root,
        operation.collection,
        names[operation.index] ?? '',
        operation.name,
      );
    }
    if (operation.kind === 'delete') {
      const references = definitionReferences(
        source,
        'json',
        operation.collection,
        names[operation.index] ?? '',
      );
      if (references.length > 0)
        return {
          source,
          error: `Cannot delete “${names[operation.index]}”: ${references.slice(0, 3).join(', ')} still reference it.`,
        };
      values.splice(operation.index, 1);
    }
    if (operation.kind === 'move') {
      const targetIndex = operation.direction === 'up' ? operation.index - 1 : operation.index + 1;
      if (targetIndex >= 0 && targetIndex < values.length)
        [values[operation.index], values[targetIndex]] = [
          values[targetIndex]!,
          values[operation.index]!,
        ];
    }
  }
  root[operation.collection] = values;
  return { source: `${JSON.stringify(root, null, 2)}\n`, error: null };
}

function workflowDefinitions(
  root: Record<string, unknown>,
  create = false,
): Record<string, unknown> | null {
  const extensions = Array.isArray(root.extensions) ? root.extensions : [];
  for (const extension of extensions) {
    if (!isRecord(extension) || extension.extensionid !== 'workflow-uri-definitions') continue;
    if (isRecord(extension.definitions)) return extension.definitions;
    if (create) {
      extension.definitions = {};
      return extension.definitions as Record<string, unknown>;
    }
    return null;
  }
  if (!create) return null;
  const extension = { extensionid: 'workflow-uri-definitions', definitions: {} };
  if (!Array.isArray(root.extensions)) root.extensions = [];
  (root.extensions as unknown[]).push(extension);
  return extension.definitions;
}

function createYamlDefinition(
  source: string,
  operation: Extract<DefinitionOperation, { kind: 'create' }>,
): DefinitionPatchResult {
  const lines = source.split(/\r?\n/);
  let collectionLine = lines.findIndex((line) => line === `${operation.collection}:`);
  const fields = definitionFields(operation.collection, operation.name);
  if (collectionLine < 0) {
    const insertAt = findNextTopLevel(lines, 0);
    lines.splice(insertAt, 0, `${operation.collection}:`, ...fields);
  } else {
    lines.splice(findNextTopLevel(lines, collectionLine), 0, ...fields);
  }
  return { source: lines.join('\n'), error: null };
}
function definitionFields(collection: DefinitionKind, name: string): string[] {
  const value = yamlScalar(name);
  if (collection === 'functions') return [`  - name: ${value}`, `    operation: ''`];
  if (collection === 'events') return [`  - name: ${value}`, `    source: ''`, `    type: ''`];
  return [`  - name: ${value}`, `    code: ''`];
}
function createJsonDefinition(collection: DefinitionKind, name: string): Record<string, unknown> {
  if (collection === 'functions') return { name, operation: '' };
  if (collection === 'events') return { name, source: '', type: '' };
  return { name, code: '' };
}
function yamlBlocks(
  source: string,
  collection: DefinitionKind,
): Array<{ name: string; index: number; start: number; endExclusive: number; indent: number }> {
  const lines = source.split(/\r?\n/);
  const collectionLine = lines.findIndex((line) => line === `${collection}:`);
  if (collectionLine < 0) return [];
  const items: Array<{
    name: string;
    index: number;
    start: number;
    endExclusive: number;
    indent: number;
  }> = [];
  let itemIndent: number | null = null;
  for (let line = collectionLine + 1; line < lines.length; line += 1) {
    if (isTopLevelLine(lines[line] ?? '')) break;
    const match = (lines[line] ?? '').match(/^(\s*)-\s+name\s*:\s*(.+?)\s*$/);
    if (!match) continue;
    const indent = match[1]?.length ?? 0;
    if (itemIndent === null) itemIndent = indent;
    if (indent !== itemIndent) continue;
    items.push({
      name: unquote(match[2] ?? ''),
      index: items.length,
      start: line,
      endExclusive: 0,
      indent,
    });
  }
  items.forEach((item, index) => {
    item.endExclusive = items[index + 1]?.start ?? findNextTopLevel(lines, item.start);
  });
  return items;
}
function definitionReferences(
  source: string,
  format: DocumentResponse['format'],
  collection: DefinitionKind,
  name: string,
): string[] {
  const keys = referenceKeys(collection);
  if (format === 'json') {
    try {
      const root = JSON.parse(source) as unknown;
      const lines: string[] = [];
      const visit = (value: unknown, path: string): void => {
        if (Array.isArray(value)) {
          value.forEach((item, index) => visit(item, `${path}[${index}]`));
          return;
        }
        if (!isRecord(value)) return;
        Object.entries(value).forEach(([key, child]) => {
          if (keys.has(key) && containsReference(child, name)) lines.push(`${path}.${key}`);
          else visit(child, `${path}.${key}`);
        });
      };
      visit(root, '$');
      return lines;
    } catch {
      return [];
    }
  }
  return source.split(/\r?\n/).flatMap((line, index) => {
    const match = line.match(/^\s*([A-Za-z][A-Za-z0-9_-]*)\s*:\s*(.*?)\s*$/);
    if (!match || !keys.has(match[1] ?? '') || !containsReference(match[2] ?? '', name)) return [];
    return [`${match[1]} on line ${index + 1}`];
  });
}
function replaceDefinitionReferences(
  source: string,
  format: DocumentResponse['format'],
  collection: DefinitionKind,
  oldName: string,
  newName: string,
): string {
  if (format === 'json') {
    try {
      const root = JSON.parse(source) as unknown;
      replaceJsonReferences(root, collection, oldName, newName);
      return `${JSON.stringify(root, null, 2)}\n`;
    } catch {
      return source;
    }
  }
  const keys = referenceKeys(collection);
  return source
    .split(/\r?\n/)
    .map((line) => {
      const match = line.match(/^(\s*)([A-Za-z][A-Za-z0-9_-]*)(\s*:\s*)(.*)$/);
      if (!match || !keys.has(match[2] ?? '') || !containsReference(match[4] ?? '', oldName))
        return line;
      const value = match[4] ?? '';
      if (unquote(value) === oldName)
        return `${match[1]}${match[2]}${match[3]}${yamlScalar(newName)}`;
      return `${match[1]}${match[2]}${match[3]}${replaceToken(value, oldName, newName)}`;
    })
    .join('\n');
}
function replaceJsonReferences(
  value: unknown,
  collection: DefinitionKind,
  oldName: string,
  newName: string,
): void {
  if (Array.isArray(value)) {
    value.forEach((item) => replaceJsonReferences(item, collection, oldName, newName));
    return;
  }
  if (!isRecord(value)) return;
  Object.entries(value).forEach(([key, child]) => {
    if (referenceKeys(collection).has(key)) {
      if (typeof child === 'string' && child === oldName) value[key] = newName;
      else if (Array.isArray(child))
        value[key] = child.map((item) => (item === oldName ? newName : item));
    } else replaceJsonReferences(child, collection, oldName, newName);
  });
}
function referenceKeys(collection: DefinitionKind): Set<string> {
  if (collection === 'functions') return new Set(['refName']);
  if (collection === 'events') return new Set(['eventRef']);
  return new Set(['errorRef', 'errorRefs']);
}
function containsReference(value: unknown, target: string): boolean {
  if (typeof value === 'string')
    return value === target || value.split(/[\s,[\]"']+/).includes(target);
  return Array.isArray(value) && value.some((item) => containsReference(item, target));
}
function replaceToken(value: string, oldName: string, newName: string): string {
  const escaped = oldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return value.replace(
    new RegExp(`(^|[\\s,[\\]"'])${escaped}(?=$|[\\s,\\]"'])`, 'g'),
    `$1${yamlScalar(newName)}`,
  );
}
function directFieldIndex(
  lines: string[],
  start: number,
  end: number,
  indent: number,
  key: string,
): number {
  return lines.findIndex(
    (line, index) =>
      index > start && index < end && new RegExp(`^\\s{${indent + 2}}${key}\\s*:`).test(line),
  );
}
function nextDirectField(lines: string[], start: number, end: number, indent: number): number {
  const found = lines.findIndex(
    (line, index) =>
      index >= start &&
      index < end &&
      new RegExp(`^\\s{${indent}}[A-Za-z][A-Za-z0-9_-]*\\s*:`).test(line),
  );
  return found < 0 ? end : found;
}
function replaceYamlName(source: string, start: number, indent: number, name: string): string {
  const lines = source.split(/\r?\n/);
  lines[start] = replaceNameAtLine(lines[start] ?? '', indent, name);
  return lines.join('\n');
}
function replaceNameAtLine(_line: string, indent: number, name: string): string {
  return `${' '.repeat(indent)}- name: ${yamlScalar(name)}`;
}
function parseSimpleValue(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}
function singular(collection: DefinitionKind): string {
  return collection.slice(0, -1);
}
function findNextTopLevel(lines: string[], start: number): number {
  const index = lines.findIndex((line, lineIndex) => lineIndex > start && isTopLevelLine(line));
  return index < 0 ? lines.length : index;
}
function yamlDefinitionsBlock(
  lines: string[],
): { line: number; end: number; indent: number } | null {
  const line = lines.findIndex((item) => item.trim() === 'definitions:');
  if (line < 0) return null;
  const indent = indentation(lines[line] ?? '');
  const end = lines.findIndex(
    (item, index) => index > line && item.trim() !== '' && indentation(item) <= indent,
  );
  return { line, end: end < 0 ? lines.length : end, indent };
}
function yamlAliasLine(
  lines: string[],
  block: { line: number; end: number; indent: number },
  alias: string,
): number {
  return lines.findIndex(
    (line, index) =>
      index > block.line &&
      index < block.end &&
      indentation(line) === block.indent + 2 &&
      yamlKeyName(line) === alias,
  );
}
function yamlKeyName(line: string): string | null {
  const match = line.match(/^\s*(?:['"]([^'"]+)['"]|([^:]+))\s*:/);
  return (match?.[1] ?? match?.[2])?.trim() ?? null;
}
function yamlKey(value: string): string {
  return /^[A-Za-z0-9_-]+$/.test(value) ? value : `'${value.replaceAll("'", "''")}'`;
}
function isTopLevelLine(line: string): boolean {
  return (
    line.trim() !== '' &&
    !line.startsWith(' ') &&
    !line.startsWith('\t') &&
    /^[A-Za-z][A-Za-z0-9_-]*\s*:/.test(line)
  );
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
function indentation(line: string): number {
  return line.match(/^\s*/)?.[0].length ?? 0;
}
function yamlScalar(value: string): string {
  return `'${value.replaceAll("'", "''").replace(/[\r\n]+/g, ' ')}'`;
}
function unquote(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith("'") && trimmed.endsWith("'"))
    return trimmed.slice(1, -1).replaceAll("''", "'");
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    try {
      return JSON.parse(trimmed) as string;
    } catch {
      return trimmed.slice(1, -1);
    }
  }
  return trimmed;
}
