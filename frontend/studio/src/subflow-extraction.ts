import type { DocumentResponse } from './workspace';
import { parseStateSummaries, type StateSummary } from './state-patch';

export type ExtractionDependencies = {
  functionReferences: string[];
  eventReferences: string[];
  errorReferences: string[];
  subflowReferences: string[];
  requiredInputs: string[];
  producedOutputs: string[];
  unresolvedExternalDependencies: string[];
};

export type SubflowExtractionRequest = {
  source: string;
  format: DocumentResponse['format'];
  stateNames: string[];
  subflowId: string;
  subflowName: string;
  invocationStateName?: string;
};

export type SubflowExtractionResult = {
  workflowSource: string;
  subflowSource: string;
  selectedStates: string[];
  entryState: string;
  exitState: string | null;
  dependencies: ExtractionDependencies;
  error: string | null;
};

const EMPTY_DEPENDENCIES: ExtractionDependencies = {
  functionReferences: [],
  eventReferences: [],
  errorReferences: [],
  subflowReferences: [],
  requiredInputs: [],
  producedOutputs: [],
  unresolvedExternalDependencies: [],
};

/**
 * Extract a conservative, linear state range into a reusable subflow.
 *
 * Branching, nested transition semantics, and data filters are deliberately rejected because
 * converting those without explicit input/output mapping can change runtime behavior. The
 * caller receives no partial source when validation fails.
 */
export function extractSubflowStateRange(
  request: SubflowExtractionRequest,
): SubflowExtractionResult {
  const dependencies = { ...EMPTY_DEPENDENCIES };
  const stateNames = [...new Set(request.stateNames.map((name) => name.trim()).filter(Boolean))];
  const empty = (error: string): SubflowExtractionResult => ({
    workflowSource: request.source,
    subflowSource: '',
    selectedStates: stateNames,
    entryState: stateNames[0] ?? '',
    exitState: null,
    dependencies,
    error,
  });
  if (!request.subflowId.trim() || !request.subflowName.trim()) {
    return empty('Provide a subflow id and name before extracting states.');
  }
  if (stateNames.length === 0) return empty('Select at least one state to extract.');

  if (request.format === 'json') {
    return extractJson(request, stateNames, dependencies, empty);
  }
  return extractYaml(request, stateNames, dependencies, empty);
}

function extractYaml(
  request: SubflowExtractionRequest,
  stateNames: string[],
  dependencies: ExtractionDependencies,
  empty: (error: string) => SubflowExtractionResult,
): SubflowExtractionResult {
  const summaries = parseStateSummaries(request.source, 'yaml');
  const selected = stateNames.map((name) => summaries.find((state) => state.name === name));
  if (selected.some((state): state is undefined => !state)) {
    return empty('One or more selected states no longer exist in the draft.');
  }
  const blocks = selected as StateSummary[];
  const validation = validateLinearRange(request.source, blocks, summaries);
  if (validation.error)
    return { ...empty(validation.error), dependencies: validation.dependencies };
  Object.assign(dependencies, validation.dependencies);

  const lines = request.source.split(/\r?\n/);
  const first = blocks[0]!;
  const last = blocks.at(-1)!;
  const firstLine = (first.startLine ?? 1) - 1;
  const lastLine = last.endLine ?? lines.length;
  const stateIndent = indentation(lines[firstLine] ?? '');
  const invocationName = uniqueStateName(
    request.invocationStateName?.trim() || `Invoke ${request.subflowName.trim()}`,
    summaries.map((state) => state.name),
  );
  const subflowStates = lines
    .slice(firstLine, lastLine)
    .map((line) => dedentAndIndent(line, stateIndent, 2));
  const subflowSource = [
    `id: ${yamlScalar(request.subflowId.trim())}`,
    `version: '1.0'`,
    `specVersion: '0.8'`,
    `name: ${yamlScalar(request.subflowName.trim())}`,
    `start: ${yamlScalar(first.name)}`,
    'states:',
    ...subflowStates,
    '',
  ].join('\n');
  const exitState = validation.exitState;
  const replacement = yamlInvocationState(
    stateIndent,
    invocationName,
    request.subflowId.trim(),
    exitState,
    last.end,
  );
  const rewritten = [...lines];
  replaceYamlIncomingReferences(rewritten, firstLine, lastLine, first.name, invocationName);
  rewritten.splice(firstLine, lastLine - firstLine, ...replacement);
  return {
    workflowSource: rewritten.join('\n'),
    subflowSource,
    selectedStates: blocks.map((state) => state.name),
    entryState: first.name,
    exitState,
    dependencies,
    error: null,
  };
}

function extractJson(
  request: SubflowExtractionRequest,
  stateNames: string[],
  dependencies: ExtractionDependencies,
  empty: (error: string) => SubflowExtractionResult,
): SubflowExtractionResult {
  let root: Record<string, unknown>;
  try {
    const parsed = JSON.parse(request.source) as unknown;
    if (!isRecord(parsed)) return empty('The JSON document root is not an object.');
    root = parsed;
  } catch {
    return empty('Fix the JSON parse error before extracting states.');
  }
  const states = Array.isArray(root.states) ? root.states.filter(isRecord) : [];
  const summaries = states.map((state, index) => summaryFromJsonState(state, index));
  const selected = stateNames.map((name) => summaries.find((state) => state.name === name));
  if (selected.some((state): state is undefined => !state)) {
    return empty('One or more selected states no longer exist in the draft.');
  }
  const blocks = selected as StateSummary[];
  const validation = validateLinearRange(request.source, blocks, summaries, states);
  if (validation.error)
    return { ...empty(validation.error), dependencies: validation.dependencies };
  Object.assign(dependencies, validation.dependencies);
  const first = blocks[0]!;
  const last = blocks.at(-1)!;
  const invocationName = uniqueStateName(
    request.invocationStateName?.trim() || `Invoke ${request.subflowName.trim()}`,
    summaries.map((state) => state.name),
  );
  const extracted = states.slice(first.index, last.index + 1).map((state) => clone(state));
  const subflowRoot: Record<string, unknown> = {
    id: request.subflowId.trim(),
    version: '1.0',
    specVersion: '0.8',
    name: request.subflowName.trim(),
    start: first.name,
    states: extracted,
  };
  const rewrittenStates = states.slice();
  rewrittenStates.splice(first.index, last.index - first.index + 1, {
    name: invocationName,
    type: 'operation',
    actions: [
      {
        name: `Invoke ${request.subflowName.trim()}`,
        subFlowRef: request.subflowId.trim(),
        version: '1.0',
      },
    ],
    ...(validation.exitState ? { transition: validation.exitState } : { end: true }),
  });
  replaceJsonIncomingReferences(root, first.name, invocationName, new Set(stateNames));
  root.states = rewrittenStates;
  const subflowSource = `${JSON.stringify(subflowRoot, null, 2)}\n`;
  return {
    workflowSource: `${JSON.stringify(root, null, 2)}\n`,
    subflowSource,
    selectedStates: blocks.map((state) => state.name),
    entryState: first.name,
    exitState: validation.exitState,
    dependencies,
    error: null,
  };
}

function validateLinearRange(
  source: string,
  blocks: StateSummary[],
  allStates: StateSummary[],
  jsonStates?: Record<string, unknown>[],
): { error: string | null; exitState: string | null; dependencies: ExtractionDependencies } {
  const dependencies = collectDependencies(
    jsonStates
      ? jsonStates.slice(blocks[0]!.index, blocks.at(-1)!.index + 1)
      : stateText(source, blocks),
  );
  const indexes = blocks.map((state) => state.index).sort((left, right) => left - right);
  if (indexes.some((index, position) => index !== indexes[0]! + position)) {
    return {
      error: 'Select a contiguous state range in workflow order.',
      exitState: null,
      dependencies,
    };
  }
  const selected = new Set(blocks.map((state) => state.name));
  const first = blocks[0]!;
  const last = blocks.at(-1)!;
  const unsupported = new Set(['switch', 'parallel', 'foreach', 'callback']);
  if (blocks.some((state) => unsupported.has(state.type))) {
    return {
      error:
        'Extraction is limited to linear inject, operation, sleep, and event states; branching or callback states are left unchanged.',
      exitState: null,
      dependencies,
    };
  }
  const raw = jsonStates
    ? jsonStates.slice(first.index, last.index + 1)
    : stateText(source, blocks);
  if (hasUncertainFields(raw)) {
    return {
      error:
        'Extraction stopped because a selected state uses branching, error routing, or data filters that need explicit mapping.',
      exitState: null,
      dependencies,
    };
  }
  for (let index = 0; index < blocks.length - 1; index += 1) {
    const current = blocks[index]!;
    if (!current.transition || !selected.has(current.transition)) {
      return {
        error: `Selected states are not one connected linear path: “${current.name}” does not transition to the next selected state.`,
        exitState: null,
        dependencies,
      };
    }
  }
  if (!last.end && !last.transition) {
    return {
      error: `The final selected state “${last.name}” has no terminal or outgoing transition.`,
      exitState: null,
      dependencies,
    };
  }
  const incomingOutside = allStates.filter(
    (state) => state.transition === first.name && !selected.has(state.name),
  );
  const start = readTopLevelStart(source, jsonStates);
  if (
    blocks
      .slice(1)
      .some((state) =>
        allStates.some(
          (candidate) => candidate.transition === state.name && !selected.has(candidate.name),
        ),
      )
  ) {
    return {
      error:
        'A selected state other than the entry has an external incoming transition; extraction would change behavior.',
      exitState: null,
      dependencies,
    };
  }
  if (
    start !== first.name &&
    incomingOutside.length === 0 &&
    !allStates.some((state) => state.transition === first.name)
  ) {
    return {
      error: `The selected range is not connected to the workflow entry through a known transition.`,
      exitState: null,
      dependencies,
    };
  }
  return {
    error: null,
    exitState: last.end ? null : last.transition,
    dependencies,
  };
}

function collectDependencies(value: unknown): ExtractionDependencies {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  const find = (pattern: RegExp) =>
    unique([...text.matchAll(pattern)].map((match) => match[1]!).filter(Boolean));
  const functions = find(/["']?refName["']?\s*:\s*["']?([A-Za-z0-9_.:/-]+)/g);
  const events = find(/["']?eventRef["']?\s*:\s*["']?([A-Za-z0-9_.:/-]+)/g);
  const errors = find(/["']?errorRef["']?\s*:\s*["']?([A-Za-z0-9_.:/-]+)/g);
  const subflows = find(/["']?(?:subFlowRef|subflowRef)["']?\s*:\s*["']?([A-Za-z0-9_.:/-]+)/g);
  const inputs = find(/\$\{?\s*\.\s*([A-Za-z_][A-Za-z0-9_]*)/g);
  const outputs = find(
    /(?:toStateData|output|result)\s*["']?\s*:\s*["']?\.?([A-Za-z_][A-Za-z0-9_]*)/g,
  );
  const unresolved = find(/\$\{([^}]+)\}/g).map((item) => `expression: ${item}`);
  return {
    functionReferences: functions,
    eventReferences: events,
    errorReferences: errors,
    subflowReferences: subflows,
    requiredInputs: inputs,
    producedOutputs: outputs,
    unresolvedExternalDependencies: unresolved,
  };
}

function stateText(source: string, blocks: StateSummary[]): string {
  const lines = source.split(/\r?\n/);
  const first = (blocks[0]?.startLine ?? 1) - 1;
  const last = blocks.at(-1)?.endLine ?? lines.length;
  return lines.slice(first, last).join('\n');
}

function hasUncertainFields(value: unknown): boolean {
  const uncertain = new Set([
    'dataConditions',
    'defaultCondition',
    'eventConditions',
    'onErrors',
    'stateDataFilter',
    'actionDataFilter',
    'eventDataFilter',
    'branches',
    'completionType',
  ]);
  if (typeof value === 'string') {
    return new RegExp(`(?:^|\\n)\\s*(?:${[...uncertain].join('|')})\\s*:`, 'm').test(value);
  }
  let found = false;
  const visit = (current: unknown): void => {
    if (found) return;
    if (Array.isArray(current)) {
      current.forEach(visit);
      return;
    }
    if (!isRecord(current)) return;
    Object.entries(current).forEach(([key, child]) => {
      if (uncertain.has(key)) found = true;
      else visit(child);
    });
  };
  visit(value);
  return found;
}

function replaceYamlIncomingReferences(
  lines: string[],
  selectedStart: number,
  selectedEnd: number,
  entry: string,
  replacement: string,
): void {
  lines.forEach((line, index) => {
    if (index >= selectedStart && index < selectedEnd) return;
    const match = line.match(/^(\s*(?:-\s*)?(?:start|transition)\s*:\s*)(.*?)(\s*(?:#.*)?)$/);
    if (!match || unquote(match[2] ?? '') !== entry) return;
    lines[index] = `${match[1]}${yamlScalar(replacement)}${match[3] ?? ''}`;
  });
}

function replaceJsonIncomingReferences(
  root: Record<string, unknown>,
  entry: string,
  replacement: string,
  selected: Set<string>,
): void {
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!isRecord(value)) return;
    Object.entries(value).forEach(([key, child]) => {
      if ((key === 'start' || key === 'transition') && child === entry) value[key] = replacement;
      else if (!(key === 'name' && typeof child === 'string' && selected.has(child))) visit(child);
    });
  };
  visit(root);
  if (root.start === entry) root.start = replacement;
}

function yamlInvocationState(
  indent: number,
  name: string,
  reference: string,
  exitState: string | null,
  terminal: boolean,
): string[] {
  const prefix = ' '.repeat(indent);
  const action = ' '.repeat(indent + 4);
  return [
    `${prefix}- name: ${yamlScalar(name)}`,
    `${prefix}  type: operation`,
    `${prefix}  actions:`,
    `${action}- name: ${yamlScalar(`Invoke ${reference}`)}`,
    `${action}  subFlowRef: ${yamlScalar(reference)}`,
    `${action}  version: '1.0'`,
    terminal ? `${prefix}  end: true` : `${prefix}  transition: ${yamlScalar(exitState ?? '')}`,
  ];
}

function summaryFromJsonState(state: Record<string, unknown>, index: number): StateSummary {
  return {
    name: typeof state.name === 'string' ? state.name : `Unnamed state ${index + 1}`,
    type: typeof state.type === 'string' ? state.type : 'unknown',
    index,
    startLine: null,
    endLine: null,
    transition: typeof state.transition === 'string' ? state.transition : null,
    end: state.end === true,
  };
}

function readTopLevelStart(source: string, states?: Record<string, unknown>[]): string | null {
  if (states) {
    try {
      const root = JSON.parse(source) as Record<string, unknown>;
      return typeof root.start === 'string' ? root.start : null;
    } catch {
      return null;
    }
  }
  const match = source.match(/^start\s*:\s*(.*?)\s*(?:#.*)?$/m);
  return match ? unquote(match[1] ?? '') : null;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
function indentation(line: string): number {
  return line.match(/^\s*/)?.[0].length ?? 0;
}
function dedentAndIndent(line: string, from: number, to: number): string {
  if (!line.trim()) return line;
  return `${' '.repeat(to)}${line.slice(Math.min(from, indentation(line)))}`;
}
function uniqueStateName(candidate: string, existing: string[]): string {
  const base = candidate || 'Invoke subflow';
  if (!existing.includes(base)) return base;
  let suffix = 2;
  while (existing.includes(`${base} ${suffix}`)) suffix += 1;
  return `${base} ${suffix}`;
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
