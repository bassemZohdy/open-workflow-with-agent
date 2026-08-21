import type { Diagnostic, DocumentResponse, DocumentSummary } from './workspace';
import {
  applyStateField,
  applyStateOperation,
  parseStateSummaries,
  type StatePatchResult,
} from './state-patch';

export type QuickFix = {
  id: string;
  title: string;
  description: string;
  multiLocation: boolean;
  source: string;
};

/**
 * Return only fixes whose target is unambiguous and whose edit is local enough to review.
 * Every result is still shown in the Issues-panel diff before it reaches the draft.
 */
export function quickFixesFor(
  document: DocumentSummary,
  diagnostic: Diagnostic,
  source: string,
): QuickFix[] {
  if (document.kind !== 'workflow' || !source.trim()) return [];
  const result = candidateFix(document, diagnostic, source);
  return result ? [result] : [];
}

function candidateFix(
  document: DocumentSummary,
  diagnostic: Diagnostic,
  source: string,
): QuickFix | null {
  switch (diagnostic.ruleId) {
    case 'studio.workflow.switch-default':
      return missingDefaultFix(document, diagnostic, source);
    case 'studio.workflow.duplicate-state':
      return duplicateStateFix(document, diagnostic, source);
    case 'studio.workflow.unreachable-state':
      return unreachableStateFix(document, diagnostic, source);
    case 'studio.workflow.unreachable-branch':
      return unreachableBranchFix(document, diagnostic, source, false);
    case 'studio.workflow.duplicate-condition':
      return unreachableBranchFix(document, diagnostic, source, true);
    case 'studio.workflow.start-reference':
    case 'studio.workflow.transition-reference':
      return brokenRenameFix(document, diagnostic, source);
    default:
      return null;
  }
}

function missingDefaultFix(
  document: DocumentSummary,
  diagnostic: Diagnostic,
  source: string,
): QuickFix | null {
  const stateName = messageTarget(diagnostic.message);
  if (!stateName) return null;
  const states = parseStateSummaries(source, document.format);
  const stateIndex = states.findIndex((state) => state.name === stateName);
  const terminalStates = states.filter((state) => state.end);
  // A default target is behavior, not formatting. Offer it only when the workspace has
  // exactly one obvious terminal outcome and therefore no user choice is being guessed.
  if (stateIndex < 0 || terminalStates.length !== 1) return null;
  const target = terminalStates[0]?.name;
  if (!target || target === stateName) return null;
  const patched = applyStateField(
    source,
    document.format,
    stateIndex,
    'defaultCondition',
    JSON.stringify({ transition: target }),
  );
  if (patched.error || patched.source === source) return null;
  return {
    id: `${diagnostic.ruleId}:default:${stateName}`,
    title: `Add default transition to “${target}”`,
    description: `Unmatched switch input will take the only terminal state, “${target}”.`,
    multiLocation: false,
    source: patched.source,
  };
}

function duplicateStateFix(
  document: DocumentSummary,
  diagnostic: Diagnostic,
  source: string,
): QuickFix | null {
  const stateName = messageTarget(diagnostic.message);
  if (!stateName) return null;
  const states = parseStateSummaries(source, document.format);
  const duplicateIndexes = states
    .map((state, index) => (state.name === stateName ? index : -1))
    .filter((index) => index >= 0);
  const duplicateIndex = duplicateIndexes[1];
  if (duplicateIndex === undefined) return null;
  const renamed = uniqueStateName(
    states.map((state) => state.name),
    stateName,
  );
  // Do not offer an edit if the duplicate contains a self-reference. Renaming that state
  // without rewriting its internal graph could change execution semantics.
  const block = stateSourceBlock(source, document.format, duplicateIndex);
  if (block && referencesTarget(block, stateName)) return null;
  const patched = renameStateOnly(source, document.format, duplicateIndex, renamed);
  if (patched.error || patched.source === source) return null;
  return {
    id: `${diagnostic.ruleId}:rename:${duplicateIndex}`,
    title: `Rename duplicate state to “${renamed}”`,
    description:
      'Only the later duplicate declaration is renamed; existing transitions remain unchanged.',
    multiLocation: false,
    source: patched.source,
  };
}

function unreachableStateFix(
  document: DocumentSummary,
  diagnostic: Diagnostic,
  source: string,
): QuickFix | null {
  const stateName = messageTarget(diagnostic.message);
  if (!stateName) return null;
  const states = parseStateSummaries(source, document.format);
  const index = states.findIndex((state) => state.name === stateName);
  if (index < 0) return null;
  const block = stateSourceBlock(source, document.format, index);
  if (block && referencesTarget(block, stateName)) return null;
  const patched = applyStateOperation(source, document.format, { kind: 'delete', index });
  if (patched.error || patched.source === source) return null;
  return {
    id: `${diagnostic.ruleId}:remove:${stateName}`,
    title: `Remove unreachable state “${stateName}”`,
    description: 'The state has no reachable inbound path and no self-reference.',
    multiLocation: false,
    source: patched.source,
  };
}

function unreachableBranchFix(
  document: DocumentSummary,
  diagnostic: Diagnostic,
  source: string,
  duplicate: boolean,
): QuickFix | null {
  const stateName = messageTarget(diagnostic.message);
  if (!stateName) return null;
  const states = parseStateSummaries(source, document.format);
  const index = states.findIndex((state) => state.name === stateName);
  if (index < 0) return null;
  const patched = removeCondition(source, document.format, index, duplicate);
  if (patched.error || patched.source === source) return null;
  return {
    id: `${diagnostic.ruleId}:remove-branch:${stateName}`,
    title: duplicate ? 'Remove duplicate switch branch' : 'Remove unreachable switch branches',
    description: duplicate
      ? 'The later branch repeats an earlier condition.'
      : 'The first unconditional branch makes all later branches unreachable.',
    multiLocation: true,
    source: patched.source,
  };
}

function brokenRenameFix(
  document: DocumentSummary,
  diagnostic: Diagnostic,
  source: string,
): QuickFix | null {
  const missing = messageTarget(diagnostic.message);
  if (!missing) return null;
  const states = parseStateSummaries(source, document.format);
  const candidates = states.filter((state) => normalizeName(state.name) === normalizeName(missing));
  if (candidates.length !== 1 || candidates[0]?.name === missing) return null;
  const replacement = candidates[0]?.name;
  if (!replacement) return null;
  const patched = replaceReferenceTargets(source, document.format, missing, replacement);
  if (patched.error || patched.source === source) return null;
  return {
    id: `${diagnostic.ruleId}:repair:${missing}`,
    title: `Repair references to “${replacement}”`,
    description: `The unresolved target “${missing}” matches one state after normalizing case and punctuation.`,
    multiLocation: true,
    source: patched.source,
  };
}

function removeCondition(
  source: string,
  format: DocumentResponse['format'],
  stateIndex: number,
  duplicate: boolean,
): StatePatchResult {
  if (format === 'json') {
    try {
      const root = JSON.parse(source) as Record<string, unknown>;
      const states = Array.isArray(root.states) ? root.states : [];
      const state = states[stateIndex];
      if (!isRecord(state) || !Array.isArray(state.dataConditions)) {
        return { source, error: 'The switch has no editable dataConditions list.' };
      }
      const conditions = state.dataConditions.filter(isRecord);
      const removalIndex = conditionRemovalIndex(conditions, duplicate);
      if (removalIndex < 0) return { source, error: 'No removable switch branch was found.' };
      conditions.splice(removalIndex, 1);
      state.dataConditions = conditions;
      root.states = states;
      return { source: `${JSON.stringify(root, null, 2)}\n`, error: null };
    } catch {
      return { source, error: 'Fix the JSON parse error before editing switch branches.' };
    }
  }
  return removeYamlCondition(source, stateIndex, duplicate);
}

function removeYamlCondition(
  source: string,
  stateIndex: number,
  duplicate: boolean,
): StatePatchResult {
  const lines = source.split(/\r?\n/);
  const states = parseStateSummaries(source, 'yaml');
  const state = states[stateIndex];
  if (!state || state.startLine === null || state.endLine === null) {
    return { source, error: 'The switch state could not be located.' };
  }
  const stateStart = state.startLine - 1;
  const stateEnd = Math.min(lines.length, state.endLine);
  const stateIndent = (lines[stateStart]?.match(/^\s*/) ?? [''])[0].length;
  const fieldIndent = stateIndent + 2;
  const fieldLine = lines.findIndex(
    (line, index) =>
      index > stateStart &&
      index < stateEnd &&
      line.startsWith(' '.repeat(fieldIndent)) &&
      /^\s*dataConditions\s*:/.test(line),
  );
  if (fieldLine < 0) return { source, error: 'The switch has no editable dataConditions list.' };
  const blockEnd = nextYamlField(lines, fieldLine + 1, stateEnd, fieldIndent);
  const itemLines: number[] = [];
  let itemIndent: number | null = null;
  for (let line = fieldLine + 1; line < blockEnd; line += 1) {
    const match = lines[line]?.match(/^(\s*)-\s+condition\s*:\s*(.*?)\s*$/);
    if (!match) continue;
    const indent = match[1]?.length ?? 0;
    if (itemIndent === null) itemIndent = indent;
    if (indent === itemIndent) itemLines.push(line);
  }
  if (itemLines.length < 2) return { source, error: 'No removable switch branch was found.' };
  let removalStart = -1;
  let removalEnd = -1;
  if (duplicate) {
    const seen = new Set<string>();
    for (let index = 0; index < itemLines.length; index += 1) {
      const value = unquote(lines[itemLines[index]!]!.split(':').slice(1).join(':').trim());
      if (seen.has(value)) {
        removalStart = itemLines[index]!;
        removalEnd = itemLines[index + 1] ?? blockEnd;
        break;
      }
      seen.add(value);
    }
  } else {
    let unconditional = -1;
    for (let index = 0; index < itemLines.length; index += 1) {
      const value = unquote(lines[itemLines[index]!]!.split(':').slice(1).join(':').trim());
      if (isAlwaysTrue(value)) {
        unconditional = index;
        break;
      }
    }
    if (unconditional >= 0 && unconditional < itemLines.length - 1) {
      removalStart = itemLines[unconditional + 1]!;
      removalEnd = blockEnd;
    }
  }
  if (removalStart < 0 || removalEnd <= removalStart) {
    return { source, error: 'No removable switch branch was found.' };
  }
  lines.splice(removalStart, removalEnd - removalStart);
  return { source: lines.join('\n'), error: null };
}

function renameStateOnly(
  source: string,
  format: DocumentResponse['format'],
  index: number,
  name: string,
): StatePatchResult {
  if (format === 'json') {
    try {
      const root = JSON.parse(source) as Record<string, unknown>;
      const states = Array.isArray(root.states) ? root.states : [];
      const state = states[index];
      if (!isRecord(state)) return { source, error: 'The state could not be located.' };
      state.name = name;
      root.states = states;
      return { source: `${JSON.stringify(root, null, 2)}\n`, error: null };
    } catch {
      return { source, error: 'Fix the JSON parse error before renaming a state.' };
    }
  }
  const lines = source.split(/\r?\n/);
  const states = parseStateSummaries(source, format);
  const state = states[index];
  if (!state?.startLine) return { source, error: 'The state could not be located.' };
  const lineIndex = state.startLine - 1;
  const match = lines[lineIndex]?.match(/^(\s*-\s+name\s*:\s*).*(\s*(?:#.*)?)$/);
  if (!match) return { source, error: 'The state name line could not be located.' };
  lines[lineIndex] = `${match[1]}${yamlScalar(name)}${match[2] ?? ''}`;
  return { source: lines.join('\n'), error: null };
}

function replaceReferenceTargets(
  source: string,
  format: DocumentResponse['format'],
  oldName: string,
  newName: string,
): StatePatchResult {
  if (format === 'json') {
    try {
      const root = JSON.parse(source) as unknown;
      let changed = 0;
      const visit = (value: unknown): void => {
        if (Array.isArray(value)) return value.forEach(visit);
        if (!isRecord(value)) return;
        Object.entries(value).forEach(([key, child]) => {
          if ((key === 'start' || key === 'transition') && child === oldName) {
            value[key] = newName;
            changed += 1;
          } else visit(child);
        });
      };
      visit(root);
      if (!changed) return { source, error: 'No matching state references were found.' };
      return { source: `${JSON.stringify(root, null, 2)}\n`, error: null };
    } catch {
      return { source, error: 'Fix the JSON parse error before repairing references.' };
    }
  }
  const lines = source.split(/\r?\n/);
  let changed = 0;
  const escaped = escapeRegExp(oldName);
  const pattern = new RegExp(
    `^(\\s*(?:-\\s*)?(?:start|transition)\\s*:\\s*)(['"]?)${escaped}\\2(\\s*(?:#.*)?)$`,
  );
  lines.forEach((line, index) => {
    const match = line.match(pattern);
    if (!match) return;
    lines[index] = `${match[1]}${yamlScalar(newName)}${match[3] ?? ''}`;
    changed += 1;
  });
  return changed === 0
    ? { source, error: 'No matching state references were found.' }
    : { source: lines.join('\n'), error: null };
}

function stateSourceBlock(
  source: string,
  format: DocumentResponse['format'],
  index: number,
): string | null {
  const states = parseStateSummaries(source, format);
  const state = states[index];
  if (!state) return null;
  if (format === 'json') {
    try {
      return JSON.stringify((JSON.parse(source) as { states?: unknown }).states ?? []);
    } catch {
      return null;
    }
  }
  const lines = source.split(/\r?\n/);
  if (state.startLine === null || state.endLine === null) return null;
  return lines.slice(state.startLine - 1, state.endLine).join('\n');
}

function referencesTarget(source: string, target: string): boolean {
  const escaped = escapeRegExp(target);
  return new RegExp(`(?:^|\\s)(?:start|transition):\\s*['"]?${escaped}['"]?(?:\\s|$)`, 'm').test(
    source,
  );
}

function conditionRemovalIndex(
  conditions: Array<Record<string, unknown>>,
  duplicate: boolean,
): number {
  if (duplicate) {
    const seen = new Set<string>();
    for (let index = 0; index < conditions.length; index += 1) {
      const value =
        typeof conditions[index]?.condition === 'string'
          ? String(conditions[index]?.condition)
          : '';
      if (seen.has(value)) return index;
      seen.add(value);
    }
    return -1;
  }
  const index = conditions.findIndex((condition) =>
    isAlwaysTrue(typeof condition.condition === 'string' ? condition.condition : ''),
  );
  return index >= 0 && index < conditions.length - 1 ? index + 1 : -1;
}

function messageTarget(message: string): string | null {
  const value = message.slice(message.lastIndexOf(':') + 1).trim();
  return value || null;
}

function normalizeName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function uniqueStateName(names: string[], base: string): string {
  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${base} (${suffix})`;
    if (!names.includes(candidate)) return candidate;
  }
}

function isAlwaysTrue(value: string): boolean {
  return (
    value
      .replace(/\s+/g, '')
      .replace(/^['"]|['"]$/g, '')
      .match(/^\$\{?true\}?$/) !== null
  );
}

function nextYamlField(lines: string[], start: number, end: number, indent: number): number {
  const pattern = new RegExp(`^\\s{${indent}}[A-Za-z][A-Za-z0-9_-]*\\s*:`);
  const index = lines.findIndex(
    (line, lineIndex) => lineIndex >= start && lineIndex < end && pattern.test(line),
  );
  return index < 0 ? end : index;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function unquote(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith("'") && trimmed.endsWith("'"))
    return trimmed.slice(1, -1).replaceAll("''", "'");
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) return trimmed.slice(1, -1);
  return trimmed;
}

function yamlScalar(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
