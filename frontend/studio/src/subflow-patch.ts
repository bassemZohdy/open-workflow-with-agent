import type { DocumentResponse } from './workspace';
import { parseStateSummaries } from './state-patch';

export type SubflowInvocation = {
  index: number;
  actionName: string;
  reference: string;
  version: string;
  line: number | null;
};

export type SubflowPatchResult = { source: string; error: string | null };

export function subflowInvocations(
  source: string,
  format: DocumentResponse['format'],
  stateIndex: number,
): SubflowInvocation[] {
  if (format === 'json') {
    try {
      const root = JSON.parse(source) as Record<string, unknown>;
      const states = Array.isArray(root.states) ? root.states : [];
      const state = states[stateIndex];
      const invocations: SubflowInvocation[] = [];
      const visit = (value: unknown, path: string): void => {
        if (Array.isArray(value)) {
          value.forEach((item, index) => visit(item, `${path}[${index}]`));
          return;
        }
        if (!isRecord(value)) return;
        if (typeof value.subFlowRef === 'string' || typeof value.subflowRef === 'string') {
          invocations.push({
            index: invocations.length,
            actionName: typeof value.name === 'string' ? value.name : path,
            reference: stringValue(value.subFlowRef ?? value.subflowRef),
            version: stringValue(value.version) || '1.0',
            line: null,
          });
        }
        Object.entries(value).forEach(([key, child]) => visit(child, `${path}.${key}`));
      };
      visit(state, `states[${stateIndex}]`);
      return invocations;
    } catch {
      return [];
    }
  }
  const lines = source.split(/\r?\n/);
  const summary = parseStateSummaries(source, format)[stateIndex];
  if (!summary?.startLine) return [];
  const start = summary.startLine - 1;
  const end = summary.endLine ?? lines.length;
  const invocations: SubflowInvocation[] = [];
  for (let line = start + 1; line < end; line += 1) {
    const match = lines[line]?.match(/^(\s*)(subFlowRef|subflowRef)\s*:\s*(.*?)\s*$/);
    if (!match) continue;
    const reference = unquote(match[3] ?? '');
    if (!reference) continue;
    const refIndent = match[1]?.length ?? 0;
    let version = '1.0';
    for (let candidate = line + 1; candidate < end; candidate += 1) {
      const candidateLine = lines[candidate] ?? '';
      if (candidateLine.trim() === '') continue;
      if (indentation(candidateLine) < refIndent) break;
      const versionMatch = candidateLine.match(/^\s*version\s*:\s*(.*?)\s*$/);
      if (versionMatch && indentation(candidateLine) === refIndent) {
        version = unquote(versionMatch[1] ?? '') || version;
        break;
      }
    }
    invocations.push({
      index: invocations.length,
      actionName: actionNameBefore(lines, line, start, refIndent),
      reference,
      version,
      line: line + 1,
    });
  }
  return invocations;
}

export function patchSubflowInvocation(
  source: string,
  format: DocumentResponse['format'],
  stateIndex: number,
  reference: string,
  version: string,
  actionName = 'Invoke subflow',
  invocationIndex = 0,
): SubflowPatchResult {
  const target = reference.trim();
  const selectedVersion = version.trim() || '1.0';
  if (!target) return { source, error: 'Choose a target subflow.' };
  if (format === 'json')
    return patchJson(source, stateIndex, target, selectedVersion, actionName, invocationIndex);
  return patchYaml(source, stateIndex, target, selectedVersion, actionName, invocationIndex);
}

function patchJson(
  source: string,
  stateIndex: number,
  reference: string,
  version: string,
  actionName: string,
  invocationIndex: number,
): SubflowPatchResult {
  try {
    const root = JSON.parse(source) as Record<string, unknown>;
    const states = Array.isArray(root.states) ? root.states : [];
    const state = states[stateIndex];
    if (!isRecord(state)) return { source, error: 'Select a valid state first.' };
    let seen = 0;
    let updated = false;
    const visit = (value: unknown): void => {
      if (updated || value === null || typeof value !== 'object') return;
      if (Array.isArray(value)) {
        value.forEach(visit);
        return;
      }
      const object = value as Record<string, unknown>;
      if (typeof object.subFlowRef === 'string' || typeof object.subflowRef === 'string') {
        if (seen === invocationIndex) {
          const key = typeof object.subFlowRef === 'string' ? 'subFlowRef' : 'subflowRef';
          object[key] = reference;
          object.version = version;
          updated = true;
          return;
        }
        seen += 1;
      }
      Object.values(object).forEach(visit);
    };
    visit(state);
    if (!updated) {
      const actions = Array.isArray(state.actions) ? state.actions : [];
      actions.push({ name: actionName.trim() || 'Invoke subflow', subFlowRef: reference, version });
      state.actions = actions;
    }
    root.states = states;
    return { source: `${JSON.stringify(root, null, 2)}\n`, error: null };
  } catch {
    return { source, error: 'Fix the JSON parse error before editing subflow actions.' };
  }
}

function patchYaml(
  source: string,
  stateIndex: number,
  reference: string,
  version: string,
  actionName: string,
  invocationIndex: number,
): SubflowPatchResult {
  const lines = source.split(/\r?\n/);
  const summary = parseStateSummaries(source, 'yaml')[stateIndex];
  if (!summary?.startLine) return { source, error: 'Select a valid state first.' };
  const start = summary.startLine - 1;
  const end = summary.endLine ?? lines.length;
  let seen = 0;
  for (let line = start + 1; line < end; line += 1) {
    const match = lines[line]?.match(/^(\s*)(subFlowRef|subflowRef)\s*:/);
    if (!match) continue;
    if (seen !== invocationIndex) {
      seen += 1;
      continue;
    }
    const prefix = match[1] ?? '';
    lines[line] = `${prefix}${match[2]}: ${yamlScalar(reference)}`;
    const refIndent = prefix.length;
    const versionLine = lines.findIndex(
      (candidateLine, candidateIndex) =>
        candidateIndex > line &&
        candidateIndex < end &&
        candidateLine.trim() !== '' &&
        indentation(candidateLine) >= refIndent &&
        indentation(candidateLine) === refIndent &&
        /^\s*version\s*:/.test(candidateLine),
    );
    if (versionLine >= 0) lines[versionLine] = `${prefix}version: ${yamlScalar(version)}`;
    else lines.splice(line + 1, 0, `${prefix}version: ${yamlScalar(version)}`);
    return { source: lines.join('\n'), error: null };
  }
  return addYamlInvocation(lines, start, end, summary.name, reference, version, actionName);
}

function addYamlInvocation(
  lines: string[],
  stateStart: number,
  stateEnd: number,
  stateName: string,
  reference: string,
  version: string,
  actionName: string,
): SubflowPatchResult {
  const stateIndent = indentation(lines[stateStart] ?? '');
  const directIndent = stateIndent + 2;
  const actionsLine = lines.findIndex(
    (line, index) =>
      index > stateStart &&
      index < stateEnd &&
      indentation(line) === directIndent &&
      /^\s*actions\s*:/.test(line),
  );
  const actionIndent = directIndent + 2;
  const rendered = [
    `${' '.repeat(actionIndent)}- name: ${yamlScalar(actionName.trim() || 'Invoke subflow')}`,
    `${' '.repeat(actionIndent + 2)}subFlowRef: ${yamlScalar(reference)}`,
    `${' '.repeat(actionIndent + 2)}version: ${yamlScalar(version)}`,
  ];
  if (actionsLine < 0) {
    lines.splice(stateStart + 1, 0, `${' '.repeat(directIndent)}actions:`, ...rendered);
    return { source: lines.join('\n'), error: null };
  }
  const raw = lines[actionsLine]?.slice((lines[actionsLine] ?? '').indexOf(':') + 1).trim();
  if (raw === '[]') {
    lines.splice(actionsLine, 1, `${' '.repeat(directIndent)}actions:`, ...rendered);
    return { source: lines.join('\n'), error: null };
  }
  const actionEnd = lines.findIndex(
    (line, index) =>
      index > actionsLine &&
      index < stateEnd &&
      line.trim() !== '' &&
      indentation(line) <= directIndent,
  );
  lines.splice(actionEnd < 0 ? stateEnd : actionEnd, 0, ...rendered);
  return { source: lines.join('\n'), error: null };
}

function actionNameBefore(lines: string[], line: number, start: number, refIndent: number): string {
  for (let index = line - 1; index > start; index -= 1) {
    const candidate = lines[index] ?? '';
    if (candidate.trim() === '' || indentation(candidate) >= refIndent) continue;
    const match = candidate.match(/^\s*-\s+name\s*:\s*(.*?)\s*$/);
    if (match) return unquote(match[1] ?? '') || 'Invoke subflow';
    if (indentation(candidate) < refIndent - 2) break;
  }
  return 'Invoke subflow';
}

function yamlScalar(value: string): string {
  return `'${value.replaceAll("'", "''").replace(/[\r\n]+/g, ' ')}'`;
}

function unquote(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith("'") && trimmed.endsWith("'"))
    return trimmed.slice(1, -1).replaceAll("''", "'");
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) return trimmed.slice(1, -1);
  return trimmed;
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function indentation(line: string): number {
  return line.match(/^\s*/)?.[0].length ?? 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
