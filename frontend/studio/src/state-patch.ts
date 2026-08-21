import type { DocumentResponse } from './workspace';

export type StateSummary = {
  name: string;
  type: string;
  index: number;
  startLine: number | null;
  endLine: number | null;
  transition: string | null;
  end: boolean;
};

export type StateOperation =
  | { kind: 'create'; name: string; type: string }
  | { kind: 'duplicate'; index: number; name: string }
  | { kind: 'rename'; index: number; name: string }
  | { kind: 'delete'; index: number }
  | { kind: 'move'; index: number; direction: 'up' | 'down' }
  | { kind: 'edit'; index: number; type?: string; transition?: string | null; end?: boolean };

export type StatePatchResult = { source: string; error: string | null };

/** List direct state properties without descending into nested actions or filters. */
export function stateFieldKeys(
  source: string,
  format: DocumentResponse['format'],
  index: number,
): string[] {
  if (format === 'json') {
    try {
      const root = JSON.parse(source) as { states?: unknown };
      const state = Array.isArray(root.states) ? root.states[index] : null;
      return isRecord(state) ? Object.keys(state) : [];
    } catch {
      return [];
    }
  }
  const state = parseBlocks(source, format)[index];
  if (!state) return [];
  return Object.keys(
    directFields(source.split(/\r?\n/), state.start, state.endExclusive, state.indent),
  );
}

/** Create or replace a direct state-to-state connection without rewriting other fields. */
export function applyTransitionConnection(
  source: string,
  format: DocumentResponse['format'],
  fromName: string,
  toName: string,
): StatePatchResult {
  const from = fromName.trim();
  const to = toName.trim();
  if (!from || !to) return { source, error: 'Choose both a source and target state.' };
  if (from === to) return { source, error: 'A state cannot transition to itself.' };
  const index = parseStateSummaries(source, format).findIndex((state) => state.name === from);
  if (index < 0) return { source, error: `Source state “${from}” was not found.` };
  if (!parseStateSummaries(source, format).some((state) => state.name === to)) {
    return { source, error: `Target state “${to}” was not found.` };
  }
  return applyStateOperation(source, format, { kind: 'edit', index, transition: to });
}

/** Delete selected states as one transaction; any reference error leaves the source unchanged. */
export function applyStateDeletions(
  source: string,
  format: DocumentResponse['format'],
  names: string[],
): StatePatchResult {
  const selectedNames = [...new Set(names.map((name) => name.trim()).filter(Boolean))];
  if (selectedNames.length === 0) return { source, error: 'Select at least one state to delete.' };
  const summaries = parseStateSummaries(source, format);
  const selectedIndexes = selectedNames.map(
    (name) => summaries.find((state) => state.name === name)?.index,
  );
  if (selectedIndexes.some((index) => index === undefined)) {
    return { source, error: 'One or more selected states no longer exist in the draft.' };
  }
  let next = source;
  for (const index of selectedIndexes.sort((left, right) => right! - left!)) {
    const result = applyStateOperation(next, format, { kind: 'delete', index: index! });
    if (result.error) return { source, error: result.error };
    next = result.source;
  }
  return { source: next, error: null };
}

export type StateFieldKind = 'structured' | 'text';

type StateBlock = StateSummary & { start: number; endExclusive: number; indent: number };

export function parseStateSummaries(
  source: string,
  format: DocumentResponse['format'],
): StateSummary[] {
  return parseBlocks(source, format).map(({ start, endExclusive, ...summary }) => ({
    ...summary,
    startLine: format === 'yaml' ? start + 1 : null,
    endLine: format === 'yaml' ? endExclusive : null,
  }));
}

export function applyStateOperation(
  source: string,
  format: DocumentResponse['format'],
  operation: StateOperation,
): StatePatchResult {
  if (format === 'json') return applyJsonOperation(source, operation);
  const blocks = parseBlocks(source, format);
  const name =
    operation.kind === 'create' || operation.kind === 'duplicate' || operation.kind === 'rename'
      ? operation.name
      : null;
  if (name !== null && !validName(name)) return { source, error: 'State names cannot be empty.' };
  if (
    name !== null &&
    blocks.some((block) => block.name === name && block.index !== operationIndex(operation))
  ) {
    return { source, error: `A state named “${name}” already exists.` };
  }
  if (operation.kind === 'create') return createYamlState(source, blocks, operation);
  const selected = blocks[operation.index];
  if (!selected) return { source, error: 'Select a state before editing it.' };
  if (operation.kind === 'rename') {
    let next = replaceStateName(source, selected, operation.name);
    next = replaceReferences(next, selected.name, operation.name);
    return { source: next, error: null };
  }
  if (operation.kind === 'delete') {
    const inbound = referencesTo(source, selected.name);
    if (inbound.length > 0) {
      const details = inbound
        .slice(0, 3)
        .map((reference) => `${reference.field} on line ${reference.line}`)
        .join(', ');
      return {
        source,
        error: `Cannot delete “${selected.name}”: ${details} still reference it. Repair those references first.`,
      };
    }
    const lines = source.split(/\r?\n/);
    lines.splice(selected.start, selected.endExclusive - selected.start);
    return { source: lines.join('\n'), error: null };
  }
  if (operation.kind === 'duplicate') {
    const lines = source.split(/\r?\n/);
    const block = lines
      .slice(selected.start, selected.endExclusive)
      .map((line, lineIndex) =>
        lineIndex === 0 ? replaceStateNameLine(selected.indent, operation.name) : line,
      );
    lines.splice(selected.endExclusive, 0, ...block);
    return { source: lines.join('\n'), error: null };
  }
  if (operation.kind === 'move') {
    const targetIndex = operation.direction === 'up' ? operation.index - 1 : operation.index + 1;
    const target = blocks[targetIndex];
    if (!target) return { source, error: null };
    const lines = source.split(/\r?\n/);
    const selectedLines = lines.slice(selected.start, selected.endExclusive);
    const targetLines = lines.slice(target.start, target.endExclusive);
    const first = Math.min(selected.start, target.start);
    const last = Math.max(selected.endExclusive, target.endExclusive);
    const replacement =
      operation.direction === 'up'
        ? [...selectedLines, ...targetLines]
        : [...targetLines, ...selectedLines];
    lines.splice(first, last - first, ...replacement);
    return { source: lines.join('\n'), error: null };
  }
  return editYamlState(source, selected, operation);
}

/** Return the editable value for a direct state field without parsing the rest of the document. */
export function stateFieldText(
  source: string,
  format: DocumentResponse['format'],
  index: number,
  key: string,
): string {
  if (format === 'json') {
    try {
      const root = JSON.parse(source) as Record<string, unknown>;
      const states = Array.isArray(root.states) ? root.states : [];
      const state = states[index];
      if (!isRecord(state) || state[key] === undefined) return '';
      return typeof state[key] === 'string'
        ? (state[key] as string)
        : JSON.stringify(state[key], null, 2);
    } catch {
      return '';
    }
  }
  const state = parseBlocks(source, format)[index];
  if (!state) return '';
  const lines = source.split(/\r?\n/);
  const field = directFieldIndex(lines, state.start, state.endExclusive, state.indent, key);
  if (field < 0) return '';
  const fieldIndent = state.indent + 2;
  const fieldLine = lines[field] ?? '';
  const colon = fieldLine.indexOf(':');
  const inline = fieldLine.slice(colon + 1).trim();
  const fieldEnd = nextDirectFieldIndex(lines, field + 1, state.endExclusive, fieldIndent);
  if (inline && !/^[>|][+-]?$/.test(inline)) return unquote(inline);
  const body = lines
    .slice(field + 1, fieldEnd)
    .map((line) =>
      line.startsWith(' '.repeat(fieldIndent + 2)) ? line.slice(fieldIndent + 2) : line.trim(),
    )
    .join('\n')
    .trimEnd();
  return body;
}

/** Patch one direct state field while retaining every other state field and comment. */
export function applyStateField(
  source: string,
  format: DocumentResponse['format'],
  index: number,
  key: string,
  text: string,
): StatePatchResult {
  if (!validFieldKey(key)) {
    return {
      source,
      error: 'Property names must start with a letter and contain only letters, numbers, _ or -.',
    };
  }
  const value = text.trim();
  if (format === 'json') {
    let root: Record<string, unknown>;
    try {
      const parsed = JSON.parse(source) as unknown;
      if (!isRecord(parsed)) return { source, error: 'The JSON document root is not an object.' };
      root = parsed;
    } catch {
      return { source, error: 'Fix the JSON parse error before editing state fields.' };
    }
    const states = Array.isArray(root.states) ? root.states : [];
    const state = states[index];
    if (!isRecord(state))
      return { source, error: 'Select a valid state before editing its fields.' };
    if (!value) delete state[key];
    else {
      const parsedValue = parseFieldValue(value);
      if (parsedValue.error) return { source, error: parsedValue.error };
      state[key] = parsedValue.value;
    }
    root.states = states;
    return { source: `${JSON.stringify(root, null, 2)}\n`, error: null };
  }
  const state = parseBlocks(source, format)[index];
  if (!state) return { source, error: 'Select a valid state before editing its fields.' };
  const lines = source.split(/\r?\n/);
  const fieldIndent = state.indent + 2;
  const field = directFieldIndex(lines, state.start, state.endExclusive, state.indent, key);
  if (field >= 0) {
    const fieldEnd = nextDirectFieldIndex(lines, field + 1, state.endExclusive, fieldIndent);
    const rendered = value ? renderYamlField(key, value, fieldIndent) : [];
    lines.splice(field, fieldEnd - field, ...rendered);
  } else if (value) {
    lines.splice(state.start + 1, 0, ...renderYamlField(key, value, fieldIndent));
  }
  return { source: lines.join('\n'), error: null };
}

function parseBlocks(source: string, format: DocumentResponse['format']): StateBlock[] {
  if (format === 'json') {
    try {
      const root = JSON.parse(source) as { states?: unknown };
      if (!Array.isArray(root.states)) return [];
      return root.states.flatMap((value, index) => {
        if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
        const state = value as Record<string, unknown>;
        const name = typeof state.name === 'string' ? state.name : `Unnamed state ${index + 1}`;
        return [
          {
            name,
            type: typeof state.type === 'string' ? state.type : 'unknown',
            index,
            startLine: null,
            endLine: null,
            transition: typeof state.transition === 'string' ? state.transition : null,
            end: state.end === true,
            start: index,
            endExclusive: index + 1,
            indent: 0,
          },
        ];
      });
    } catch {
      return [];
    }
  }
  const lines = source.split(/\r?\n/);
  const statesLine = lines.findIndex((line) => /^states\s*:/.test(line));
  if (statesLine < 0) return [];
  const items: Array<{ line: number; indent: number; name: string }> = [];
  let stateIndent: number | null = null;
  for (let line = statesLine + 1; line < lines.length; line += 1) {
    if (isTopLevelLine(lines[line] ?? '')) break;
    const match = (lines[line] ?? '').match(/^(\s*)-\s+name\s*:\s*(.+?)\s*$/);
    if (match) {
      const indent = match[1]?.length ?? 0;
      if (stateIndent === null) stateIndent = indent;
      if (indent === stateIndent) items.push({ line, indent, name: unquote(match[2] ?? '') });
    }
  }
  return items.map((item, index) => {
    const endExclusive = items[index + 1]?.line ?? findNextTopLevel(lines, item.line);
    const direct = directFields(lines, item.line, endExclusive, item.indent);
    return {
      name: item.name,
      type: direct.type ?? 'unknown',
      index,
      startLine: item.line + 1,
      endLine: endExclusive,
      transition: direct.transition ?? null,
      end: direct.end === 'true',
      start: item.line,
      endExclusive,
      indent: item.indent,
    };
  });
}

function createYamlState(
  source: string,
  blocks: StateBlock[],
  operation: Extract<StateOperation, { kind: 'create' }>,
): StatePatchResult {
  if (!validName(operation.name)) return { source, error: 'State names cannot be empty.' };
  if (blocks.some((block) => block.name === operation.name))
    return { source, error: `A state named “${operation.name}” already exists.` };
  const lines = source.split(/\r?\n/);
  const statesLine = lines.findIndex((line) => /^states\s*:/.test(line));
  if (statesLine < 0) return { source, error: 'This document has no states collection.' };
  const insertAt = findNextTopLevel(lines, statesLine);
  const indent = blocks[0]?.indent ?? 2;
  const prefix = ' '.repeat(indent);
  lines.splice(
    insertAt,
    0,
    `${prefix}- name: ${yamlScalar(operation.name)}`,
    `${prefix}  type: ${yamlScalar(operation.type)}`,
    `${prefix}  end: true`,
  );
  return { source: lines.join('\n'), error: null };
}

function editYamlState(
  source: string,
  state: StateBlock,
  operation: Extract<StateOperation, { kind: 'edit' }>,
): StatePatchResult {
  const lines = source.split(/\r?\n/);
  const changes: Array<[string, string | null]> = [];
  if (operation.type !== undefined) changes.push(['type', operation.type]);
  if (operation.transition !== undefined) changes.push(['transition', operation.transition]);
  if (operation.end !== undefined) changes.push(['end', operation.end ? 'true' : null]);
  for (const [key, value] of changes) {
    const field = directFieldIndex(lines, state.start, state.endExclusive, state.indent, key);
    if (field >= 0) {
      if (value === null) lines.splice(field, 1);
      else
        lines[field] =
          `${' '.repeat(state.indent + 2)}${key}: ${key === 'type' || key === 'transition' ? yamlScalar(value) : value}`;
    } else if (value !== null) {
      lines.splice(
        state.start + 1,
        0,
        `${' '.repeat(state.indent + 2)}${key}: ${key === 'type' || key === 'transition' ? yamlScalar(value) : value}`,
      );
    }
  }
  return { source: lines.join('\n'), error: null };
}

function applyJsonOperation(source: string, operation: StateOperation): StatePatchResult {
  let root: Record<string, unknown>;
  try {
    const parsed = JSON.parse(source) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
      return { source, error: 'The JSON document root is not an object.' };
    root = parsed as Record<string, unknown>;
  } catch {
    return { source, error: 'Fix the JSON parse error before editing states.' };
  }
  const states = Array.isArray(root.states) ? root.states.filter(isRecord) : [];
  const names = states.map((state, index) =>
    typeof state.name === 'string' ? state.name : `Unnamed state ${index + 1}`,
  );
  const requestedName =
    operation.kind === 'create' || operation.kind === 'duplicate' || operation.kind === 'rename'
      ? operation.name
      : null;
  if (requestedName !== null && !validName(requestedName))
    return { source, error: 'State names cannot be empty.' };
  const selectedIndex = 'index' in operation ? operation.index : -1;
  if (
    requestedName !== null &&
    names.some((value, index) => value === requestedName && index !== selectedIndex)
  )
    return { source, error: `A state named “${requestedName}” already exists.` };
  if (operation.kind === 'create')
    states.push({ name: operation.name, type: operation.type, end: true });
  else if (operation.kind === 'duplicate') {
    const selected = states[operation.index];
    if (!selected) return { source, error: 'Select a state before duplicating it.' };
    states.splice(operation.index + 1, 0, { ...selected, name: operation.name });
  } else {
    const selected = states[operation.index];
    if (!selected) return { source, error: 'Select a state before editing it.' };
    if (operation.kind === 'rename') {
      selected.name = operation.name;
      replaceJsonReferences(root, names[operation.index] ?? '', operation.name);
    }
    if (operation.kind === 'delete') {
      const target = names[operation.index] ?? '';
      if (jsonReferencesTo(root, target).length > 0)
        return {
          source,
          error: `Cannot delete “${target}”: other fields still reference it. Repair those references first.`,
        };
      states.splice(operation.index, 1);
    }
    if (operation.kind === 'move') {
      const targetIndex = operation.direction === 'up' ? operation.index - 1 : operation.index + 1;
      if (targetIndex >= 0 && targetIndex < states.length)
        [states[operation.index], states[targetIndex]] = [
          states[targetIndex]!,
          states[operation.index]!,
        ];
    }
    if (operation.kind === 'edit') {
      if (operation.type !== undefined) selected.type = operation.type;
      if (operation.transition !== undefined) {
        if (operation.transition === null) delete selected.transition;
        else selected.transition = operation.transition;
      }
      if (operation.end !== undefined) {
        if (operation.end) selected.end = true;
        else delete selected.end;
      }
    }
  }
  root.states = states;
  return { source: `${JSON.stringify(root, null, 2)}\n`, error: null };
}

type Reference = { field: string; target: string; line: number };
function referencesTo(source: string, target: string): Reference[] {
  return source.split(/\r?\n/).flatMap((line, index) => {
    const match = line.match(/^\s*(?:-\s*)?(start|transition)\s*:\s*(.*?)\s*(?:#.*)?$/);
    const value = match ? unquote(match[2] ?? '') : '';
    return match && value === target
      ? [{ field: match[1] ?? 'reference', target, line: index + 1 }]
      : [];
  });
}
function replaceReferences(source: string, oldName: string, newName: string): string {
  return source
    .split(/\r?\n/)
    .map((line) => {
      const match = line.match(/^(\s*(?:-\s*)?(?:start|transition)\s*:\s*)(.*?)(\s*(?:#.*)?)$/);
      if (!match || unquote(match[2] ?? '') !== oldName) return line;
      return `${match[1]}${yamlScalar(newName)}${match[3] ?? ''}`;
    })
    .join('\n');
}
function replaceStateName(source: string, state: StateBlock, newName: string): string {
  const lines = source.split(/\r?\n/);
  lines[state.start] = replaceStateNameLine(state.indent, newName);
  return lines.join('\n');
}
function replaceStateNameLine(indent: number, newName: string): string {
  return `${' '.repeat(indent)}- name: ${yamlScalar(newName)}`;
}
function directFields(
  lines: string[],
  start: number,
  end: number,
  indent: number,
): Record<string, string> {
  const fields: Record<string, string> = {};
  for (let index = start + 1; index < end; index += 1) {
    const match = (lines[index] ?? '').match(
      new RegExp(`^\\s{${indent + 2}}([A-Za-z][A-Za-z0-9_-]*)\\s*:\\s*(.*?)\\s*$`),
    );
    if (match) fields[match[1] ?? ''] = unquote(match[2] ?? '');
  }
  return fields;
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
function nextDirectFieldIndex(lines: string[], start: number, end: number, indent: number): number {
  const pattern = new RegExp(`^\\s{${indent}}[A-Za-z][A-Za-z0-9_-]*\\s*:`);
  const found = lines.findIndex(
    (line, index) => index >= start && index < end && pattern.test(line),
  );
  return found < 0 ? end : found;
}
function parseFieldValue(value: string): { value: unknown; error: string | null } {
  try {
    return { value: JSON.parse(value) as unknown, error: null };
  } catch {
    if (/^[\[{]/.test(value) && !/^\s*[-\w]+\s*:/.test(value)) {
      return {
        value: null,
        error: 'Enter valid JSON or a YAML mapping/list for this structured field.',
      };
    }
    return { value, error: null };
  }
}
function renderYamlField(key: string, value: string, indent: number): string[] {
  const prefix = ' '.repeat(indent);
  const parsed = parseFieldValue(value);
  if (parsed.error) return [`${prefix}${key}: ${yamlScalar(value)}`];
  if (typeof parsed.value !== 'string') return [`${prefix}${key}: ${JSON.stringify(parsed.value)}`];
  if (value.includes('\n') || /^\s*[-\w]+\s*:/.test(value) || /^\s*-\s+/.test(value)) {
    return [`${prefix}${key}:`, ...value.split(/\r?\n/).map((line) => `${prefix}  ${line}`)];
  }
  return [`${prefix}${key}: ${yamlScalar(value)}`];
}
function isTopLevelLine(line: string): boolean {
  return (
    line.trim() !== '' &&
    !line.startsWith(' ') &&
    !line.startsWith('\t') &&
    /^[A-Za-z][A-Za-z0-9_-]*\s*:/.test(line)
  );
}
function findNextTopLevel(lines: string[], start: number): number {
  const index = lines.findIndex((line, lineIndex) => lineIndex > start && isTopLevelLine(line));
  return index < 0 ? lines.length : index;
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
function validName(value: string): boolean {
  return value.trim().length > 0;
}
function validFieldKey(value: string): boolean {
  return /^[A-Za-z][A-Za-z0-9_-]*$/.test(value.trim());
}
function operationIndex(operation: StateOperation): number {
  return 'index' in operation ? operation.index : -1;
}
function yamlScalar(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
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

function replaceJsonReferences(value: unknown, oldName: string, newName: string): void {
  if (Array.isArray(value)) {
    value.forEach((item) => replaceJsonReferences(item, oldName, newName));
    return;
  }
  if (!isRecord(value)) return;
  Object.entries(value).forEach(([key, child]) => {
    if ((key === 'start' || key === 'transition') && child === oldName) value[key] = newName;
    else replaceJsonReferences(child, oldName, newName);
  });
}
function jsonReferencesTo(value: unknown, target: string): string[] {
  const found: string[] = [];
  const visit = (current: unknown): void => {
    if (Array.isArray(current)) {
      current.forEach(visit);
      return;
    }
    if (!isRecord(current)) return;
    Object.entries(current).forEach(([key, child]) => {
      if ((key === 'start' || key === 'transition') && child === target) found.push(key);
      else visit(child);
    });
  };
  visit(value);
  return found;
}
