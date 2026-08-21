import type { DocumentResponse } from './workspace';

export type CatalogMetadataField = 'title' | 'version' | 'description';
export type CatalogPatchResult = { source: string; error: string | null };
export type CatalogOperationField = 'operationId' | 'summary' | 'description';
export type CatalogOperationStructuredField = 'parameters' | 'requestBody' | 'responses';
export type CatalogComponentType =
  | 'schemas'
  | 'responses'
  | 'parameters'
  | 'examples'
  | 'requestBodies'
  | 'headers'
  | 'securitySchemes'
  | 'links'
  | 'callbacks';
export type CatalogOperation = {
  path: string;
  method: string;
  operationId: string;
  summary: string;
  description: string;
};
export type NewCatalogOperation = CatalogOperation;

export function catalogMetadataFromSource(
  document: DocumentResponse,
  source: string,
  field: CatalogMetadataField,
): string {
  if (document.format === 'json') {
    try {
      const root = JSON.parse(source) as Record<string, unknown>;
      const info = record(root.info);
      return typeof info?.[field] === 'string' ? info[field] : '';
    } catch {
      return '';
    }
  }
  const lines = source.split(/\r?\n/);
  const infoLine = lines.findIndex((line) => /^info\s*:/.test(line));
  if (infoLine < 0) return '';
  const infoIndent = indentation(lines[infoLine] ?? '');
  const fieldLine = lines.findIndex(
    (line, index) =>
      index > infoLine &&
      index < findBlockEnd(lines, infoLine) &&
      indentation(line) === infoIndent + 2 &&
      new RegExp(`^\\s*${field}\\s*:`).test(line),
  );
  if (fieldLine < 0) return '';
  const raw = lines[fieldLine]?.slice((lines[fieldLine] ?? '').indexOf(':') + 1).trim() ?? '';
  return unquote(raw);
}

export function patchCatalogMetadata(
  source: string,
  format: DocumentResponse['format'],
  field: CatalogMetadataField,
  value: string,
): CatalogPatchResult {
  const trimmed = value.trim();
  if (format === 'json') {
    try {
      const parsed = JSON.parse(source) as unknown;
      if (!isRecord(parsed)) return { source, error: 'The JSON document root must be an object.' };
      const info = isRecord(parsed.info) ? parsed.info : {};
      if (trimmed) info[field] = trimmed;
      else delete info[field];
      parsed.info = info;
      return { source: `${JSON.stringify(parsed, null, 2)}\n`, error: null };
    } catch {
      return { source, error: 'Fix the JSON parse error before editing catalog metadata.' };
    }
  }
  const lines = source.split(/\r?\n/);
  const infoLine = lines.findIndex((line) => /^info\s*:/.test(line));
  if (infoLine < 0) return { source, error: 'This catalog has no top-level info object.' };
  const infoIndent = indentation(lines[infoLine] ?? '');
  const blockEnd = findBlockEnd(lines, infoLine);
  const fieldLine = lines.findIndex(
    (line, index) =>
      index > infoLine &&
      index < blockEnd &&
      indentation(line) === infoIndent + 2 &&
      new RegExp(`^\\s*${field}\\s*:`).test(line),
  );
  const rendered = trimmed ? `${' '.repeat(infoIndent + 2)}${field}: ${yamlScalar(trimmed)}` : null;
  if (fieldLine >= 0) {
    const next = nextInfoField(lines, fieldLine + 1, blockEnd, infoIndent + 2);
    lines.splice(fieldLine, next - fieldLine, ...(rendered ? [rendered] : []));
  } else if (rendered) {
    lines.splice(infoLine + 1, 0, rendered);
  }
  return { source: lines.join('\n'), error: null };
}

export function catalogServersText(document: DocumentResponse, source: string): string {
  if (document.format === 'json') {
    try {
      const root = JSON.parse(source) as Record<string, unknown>;
      return JSON.stringify(Array.isArray(root.servers) ? root.servers : [], null, 2);
    } catch {
      return '[]';
    }
  }
  const lines = source.split(/\r?\n/);
  const serverLine = lines.findIndex((line) => /^servers\s*:/.test(line));
  if (serverLine < 0) return '[]';
  const raw = lines[serverLine]?.slice((lines[serverLine] ?? '').indexOf(':') + 1).trim() ?? '';
  if (raw) return raw;
  const end = findBlockEnd(lines, serverLine);
  const body = lines.slice(serverLine + 1, end);
  const nonEmpty = body.filter((line) => line.trim());
  if (nonEmpty.length === 0) return '[]';
  const indent = Math.min(...nonEmpty.map(indentation));
  return body
    .map((line) => line.slice(Math.min(indent, line.length)))
    .join('\n')
    .trim();
}

export function patchCatalogServers(
  source: string,
  format: DocumentResponse['format'],
  text: string,
): CatalogPatchResult {
  const value = parseServers(text);
  if (value.error) return { source, error: value.error };
  if (format === 'json') {
    try {
      const parsed = JSON.parse(source) as unknown;
      if (!isRecord(parsed)) return { source, error: 'The JSON document root must be an object.' };
      parsed.servers = value.value;
      return { source: `${JSON.stringify(parsed, null, 2)}\n`, error: null };
    } catch {
      return { source, error: 'Fix the JSON parse error before editing servers.' };
    }
  }
  const lines = source.split(/\r?\n/);
  const serverLine = lines.findIndex((line) => /^servers\s*:/.test(line));
  const rendered = renderYamlServers(value.value);
  if (serverLine < 0) {
    const insertAt = lines.findIndex((line) => /^paths\s*:/.test(line));
    lines.splice(insertAt < 0 ? lines.length : insertAt, 0, ...rendered);
  } else {
    lines.splice(serverLine, findBlockEnd(lines, serverLine) - serverLine, ...rendered);
  }
  return { source: lines.join('\n'), error: null };
}

export function catalogOperationsFromSource(
  document: DocumentResponse,
  source: string,
): CatalogOperation[] {
  if (document.format === 'json') {
    try {
      const root = JSON.parse(source) as Record<string, unknown>;
      return operationsFromRoot(root);
    } catch {
      return [];
    }
  }
  const lines = source.split(/\r?\n/);
  const pathsLine = lines.findIndex((line) => /^paths\s*:/.test(line));
  if (pathsLine < 0) return [];
  const pathsRaw = lines[pathsLine]?.slice((lines[pathsLine] ?? '').indexOf(':') + 1).trim();
  if (pathsRaw === '{}') return [];
  const pathsEnd = findBlockEnd(lines, pathsLine);
  const operations: CatalogOperation[] = [];
  for (let pathLine = pathsLine + 1; pathLine < pathsEnd; pathLine += 1) {
    const pathMatch = lines[pathLine]?.match(/^\s{2}(['"]?)(\/[^:]+)\1\s*:/);
    if (!pathMatch) continue;
    const path = pathMatch[2] ?? '';
    const pathEnd = findIndentedBlockEnd(lines, pathLine, 2, pathsEnd);
    for (let methodLine = pathLine + 1; methodLine < pathEnd; methodLine += 1) {
      const methodMatch = lines[methodLine]?.match(/^\s{4}([A-Za-z]+)\s*:/);
      const method = methodMatch?.[1]?.toLowerCase();
      if (!method || !HTTP_METHODS.has(method)) continue;
      const operationEnd = findIndentedBlockEnd(lines, methodLine, 4, pathEnd);
      operations.push({
        path,
        method,
        operationId: yamlField(lines, methodLine, operationEnd, 'operationId'),
        summary: yamlField(lines, methodLine, operationEnd, 'summary'),
        description: yamlField(lines, methodLine, operationEnd, 'description'),
      });
      methodLine = operationEnd - 1;
    }
    pathLine = pathEnd - 1;
  }
  return operations;
}

export function patchCatalogOperation(
  source: string,
  format: DocumentResponse['format'],
  operation: Pick<CatalogOperation, 'path' | 'method'>,
  field: CatalogOperationField,
  value: string,
): CatalogPatchResult {
  const trimmed = value.trim();
  if (format === 'json') {
    try {
      const parsed = JSON.parse(source) as unknown;
      if (!isRecord(parsed)) return { source, error: 'The JSON document root must be an object.' };
      const paths = isRecord(parsed.paths) ? parsed.paths : null;
      const pathItemValue = paths?.[operation.path];
      const pathItem = isRecord(pathItemValue) ? pathItemValue : null;
      const targetValue = pathItem?.[operation.method];
      const target = isRecord(targetValue) ? targetValue : null;
      if (!target)
        return { source, error: 'The selected operation no longer exists in this draft.' };
      if (trimmed) target[field] = trimmed;
      else delete target[field];
      return { source: `${JSON.stringify(parsed, null, 2)}\n`, error: null };
    } catch {
      return { source, error: 'Fix the JSON parse error before editing the operation.' };
    }
  }
  const lines = source.split(/\r?\n/);
  const located = locateYamlOperation(lines, operation.path, operation.method);
  if (!located) return { source, error: 'The selected operation no longer exists in this draft.' };
  const rendered = trimmed ? `${' '.repeat(6)}${field}: ${yamlScalar(trimmed)}` : null;
  const fieldLine = yamlFieldLine(lines, located.methodLine, located.operationEnd, field);
  if (fieldLine >= 0) {
    const next = nextYamlField(lines, fieldLine + 1, located.operationEnd, 6);
    lines.splice(fieldLine, next - fieldLine, ...(rendered ? [rendered] : []));
  } else if (rendered) {
    lines.splice(located.methodLine + 1, 0, rendered);
  }
  return { source: lines.join('\n'), error: null };
}

export function removeCatalogOperation(
  source: string,
  format: DocumentResponse['format'],
  operation: Pick<CatalogOperation, 'path' | 'method'>,
): CatalogPatchResult {
  if (format === 'json') {
    try {
      const parsed = JSON.parse(source) as unknown;
      if (!isRecord(parsed)) return { source, error: 'The JSON document root must be an object.' };
      const paths = isRecord(parsed.paths) ? parsed.paths : null;
      const candidate = paths?.[operation.path];
      const pathItem = isRecord(candidate) ? candidate : null;
      if (!pathItem || !isRecord(pathItem[operation.method])) {
        return { source, error: 'The selected operation no longer exists in this draft.' };
      }
      delete pathItem[operation.method];
      if (Object.keys(pathItem).length === 0) delete paths?.[operation.path];
      return { source: `${JSON.stringify(parsed, null, 2)}\n`, error: null };
    } catch {
      return { source, error: 'Fix the JSON parse error before deleting the operation.' };
    }
  }
  const lines = source.split(/\r?\n/);
  const located = locateYamlOperation(lines, operation.path, operation.method);
  if (!located) return { source, error: 'The selected operation no longer exists in this draft.' };
  const hasPathLevelFields = lines.some(
    (line, index) =>
      index > located.pathLine &&
      index < located.pathEnd &&
      indentation(line) === 4 &&
      line.trim() !== '' &&
      !line.trim().startsWith('#') &&
      yamlKey(line, 4) !== operation.method,
  );
  lines.splice(located.methodLine, located.operationEnd - located.methodLine);
  if (!hasPathLevelFields) {
    lines.splice(
      located.pathLine,
      located.pathEnd - located.pathLine - (located.operationEnd - located.methodLine),
    );
  }
  return { source: lines.join('\n'), error: null };
}

export function catalogOperationStructuredText(
  document: DocumentResponse,
  source: string,
  operation: Pick<CatalogOperation, 'path' | 'method'>,
  field: CatalogOperationStructuredField,
): string {
  const emptyValue = field === 'parameters' ? '[]' : '{}';
  if (document.format === 'json') {
    try {
      const parsed = JSON.parse(source) as Record<string, unknown>;
      const target = operationFromRoot(parsed, operation);
      return target && target[field] !== undefined
        ? JSON.stringify(target[field], null, 2)
        : emptyValue;
    } catch {
      return emptyValue;
    }
  }
  const lines = source.split(/\r?\n/);
  const located = locateYamlOperation(lines, operation.path, operation.method);
  if (!located) return emptyValue;
  const fieldLine = yamlFieldLine(lines, located.methodLine, located.operationEnd, field);
  if (fieldLine < 0) return emptyValue;
  const raw = lines[fieldLine]?.slice((lines[fieldLine] ?? '').indexOf(':') + 1).trim() ?? '';
  if (raw) return raw;
  const next = nextYamlField(lines, fieldLine + 1, located.operationEnd, 6);
  const body = lines.slice(fieldLine + 1, next);
  const nonEmpty = body.filter((line) => line.trim());
  if (nonEmpty.length === 0) return emptyValue;
  const indent = Math.min(...nonEmpty.map(indentation));
  return body
    .map((line) => line.slice(Math.min(indent, line.length)))
    .join('\n')
    .trim();
}

export function patchCatalogOperationStructured(
  source: string,
  format: DocumentResponse['format'],
  operation: Pick<CatalogOperation, 'path' | 'method'>,
  field: CatalogOperationStructuredField,
  text: string,
): CatalogPatchResult {
  const trimmed = text.trim();
  if (format === 'json') {
    try {
      const value = JSON.parse(trimmed || (field === 'parameters' ? '[]' : '{}')) as unknown;
      if (field === 'parameters' && !Array.isArray(value)) {
        return { source, error: 'Parameters must be a JSON array.' };
      }
      if (field !== 'parameters' && !isRecord(value)) {
        return { source, error: `${field} must be a JSON object.` };
      }
      const parsed = JSON.parse(source) as unknown;
      const target = isRecord(parsed) ? operationFromRoot(parsed, operation) : null;
      if (!target)
        return { source, error: 'The selected operation no longer exists in this draft.' };
      target[field] = value;
      return { source: `${JSON.stringify(parsed, null, 2)}\n`, error: null };
    } catch {
      return { source, error: `Enter a valid JSON value for ${field}.` };
    }
  }
  const lines = source.split(/\r?\n/);
  const located = locateYamlOperation(lines, operation.path, operation.method);
  if (!located) return { source, error: 'The selected operation no longer exists in this draft.' };
  const fieldLine = yamlFieldLine(lines, located.methodLine, located.operationEnd, field);
  const rendered = yamlStructuredField(field, trimmed);
  if (fieldLine >= 0) {
    const next = nextYamlField(lines, fieldLine + 1, located.operationEnd, 6);
    lines.splice(fieldLine, next - fieldLine, ...(rendered ? rendered : []));
  } else if (rendered) {
    lines.splice(located.methodLine + 1, 0, ...rendered);
  }
  return { source: lines.join('\n'), error: null };
}

export function catalogComponentNamesFromSource(
  document: DocumentResponse,
  source: string,
  type: CatalogComponentType,
): string[] {
  if (document.format === 'json') {
    try {
      const parsed = JSON.parse(source) as Record<string, unknown>;
      const components = isRecord(parsed.components) ? parsed.components : null;
      const values = components && isRecord(components[type]) ? components[type] : null;
      return Object.keys(values ?? {});
    } catch {
      return [];
    }
  }
  const lines = source.split(/\r?\n/);
  const category = locateYamlComponentCategory(lines, type);
  if (!category) return [];
  const names: string[] = [];
  for (let index = category.line + 1; index < category.end; index += 1) {
    const name = yamlKey(lines[index] ?? '', 4);
    if (name) names.push(name);
  }
  return names;
}

export function catalogComponentText(
  document: DocumentResponse,
  source: string,
  type: CatalogComponentType,
  name: string,
): string {
  if (document.format === 'json') {
    try {
      const parsed = JSON.parse(source) as Record<string, unknown>;
      const components = isRecord(parsed.components) ? parsed.components : null;
      const values = components && isRecord(components[type]) ? components[type] : null;
      const value = values?.[name];
      return value === undefined ? '{}' : JSON.stringify(value, null, 2);
    } catch {
      return '{}';
    }
  }
  const lines = source.split(/\r?\n/);
  const category = locateYamlComponentCategory(lines, type);
  if (!category) return '{}';
  const nameLine = lines.findIndex(
    (line, index) => index > category.line && index < category.end && yamlKey(line, 4) === name,
  );
  if (nameLine < 0) return '{}';
  const raw = lines[nameLine]?.slice((lines[nameLine] ?? '').indexOf(':') + 1).trim() ?? '';
  if (raw) return raw;
  const end = findIndentedBlockEnd(lines, nameLine, 4, category.end);
  const body = lines.slice(nameLine + 1, end);
  const nonEmpty = body.filter((line) => line.trim());
  if (!nonEmpty.length) return '{}';
  const indent = Math.min(...nonEmpty.map(indentation));
  return body
    .map((line) => line.slice(Math.min(indent, line.length)))
    .join('\n')
    .trim();
}

export function patchCatalogComponent(
  source: string,
  format: DocumentResponse['format'],
  type: CatalogComponentType,
  name: string,
  text: string,
): CatalogPatchResult {
  const trimmed = text.trim();
  if (format === 'json') {
    try {
      const value = JSON.parse(trimmed || '{}') as unknown;
      if (!isRecord(value)) return { source, error: 'Component definitions must be JSON objects.' };
      const parsed = JSON.parse(source) as unknown;
      if (!isRecord(parsed)) return { source, error: 'The JSON document root must be an object.' };
      const components = isRecord(parsed.components) ? parsed.components : {};
      const values = isRecord(components[type]) ? components[type] : {};
      values[name] = value;
      components[type] = values;
      parsed.components = components;
      return { source: `${JSON.stringify(parsed, null, 2)}\n`, error: null };
    } catch {
      return { source, error: 'Enter a valid JSON component definition.' };
    }
  }
  const lines = source.split(/\r?\n/);
  const category = locateYamlComponentCategory(lines, type);
  if (!category) return { source, error: `This catalog has no components.${type} object.` };
  const nameLine = lines.findIndex(
    (line, index) => index > category.line && index < category.end && yamlKey(line, 4) === name,
  );
  if (nameLine < 0) return { source, error: `Component ${name} no longer exists in this draft.` };
  const end = findIndentedBlockEnd(lines, nameLine, 4, category.end);
  const rendered = yamlComponent(name, trimmed);
  lines.splice(nameLine, end - nameLine, ...rendered);
  return { source: lines.join('\n'), error: null };
}

export function addCatalogComponent(
  source: string,
  format: DocumentResponse['format'],
  type: CatalogComponentType,
  name: string,
  text: string,
): CatalogPatchResult {
  const trimmedName = name.trim();
  if (!trimmedName) return { source, error: 'A component name is required.' };
  const trimmed = text.trim() || '{}';
  if (format === 'json') {
    try {
      const value = JSON.parse(trimmed) as unknown;
      if (!isRecord(value)) return { source, error: 'Component definitions must be JSON objects.' };
      const parsed = JSON.parse(source) as unknown;
      if (!isRecord(parsed)) return { source, error: 'The JSON document root must be an object.' };
      const components = isRecord(parsed.components) ? parsed.components : {};
      const values = isRecord(components[type]) ? components[type] : {};
      if (values[trimmedName] !== undefined) {
        return { source, error: `Component ${trimmedName} already exists.` };
      }
      values[trimmedName] = value;
      components[type] = values;
      parsed.components = components;
      return { source: `${JSON.stringify(parsed, null, 2)}\n`, error: null };
    } catch {
      return { source, error: 'Enter a valid JSON component definition.' };
    }
  }
  const lines = source.split(/\r?\n/);
  const category = locateYamlComponentCategory(lines, type);
  if (!category) {
    const componentsLine = lines.findIndex((line) => /^components\s*:/.test(line));
    if (componentsLine < 0)
      return { source, error: 'This catalog has no top-level components object.' };
    const componentsEnd = findBlockEnd(lines, componentsLine);
    lines.splice(componentsEnd, 0, `  ${type}:`, ...yamlComponent(trimmedName, trimmed));
    return { source: lines.join('\n'), error: null };
  }
  const existing = lines.some(
    (line, index) =>
      index > category.line && index < category.end && yamlKey(line, 4) === trimmedName,
  );
  if (existing) return { source, error: `Component ${trimmedName} already exists.` };
  const categoryRaw = lines[category.line]
    ?.slice((lines[category.line] ?? '').indexOf(':') + 1)
    .trim();
  if (categoryRaw === '{}') {
    lines.splice(
      category.line,
      category.end - category.line,
      `  ${type}:`,
      ...yamlComponent(trimmedName, trimmed),
    );
    return { source: lines.join('\n'), error: null };
  }
  lines.splice(category.end, 0, ...yamlComponent(trimmedName, trimmed));
  return { source: lines.join('\n'), error: null };
}

export function addCatalogOperation(
  source: string,
  format: DocumentResponse['format'],
  operation: NewCatalogOperation,
): CatalogPatchResult {
  const path = operation.path.trim();
  const method = operation.method.trim().toLowerCase();
  const operationId = operation.operationId.trim();
  if (!path.startsWith('/')) return { source, error: 'Path must start with /. ' };
  if (!HTTP_METHODS.has(method)) return { source, error: 'Choose a supported HTTP method.' };
  if (!operationId) return { source, error: 'A new callable operation requires an operationId.' };
  const existing = catalogOperationsFromSource({ format } as DocumentResponse, source);
  if (existing.some((item) => item.operationId === operationId)) {
    return { source, error: `operationId "${operationId}" is already used.` };
  }
  const operationValue: Record<string, unknown> = { operationId };
  if (operation.summary.trim()) operationValue.summary = operation.summary.trim();
  if (operation.description.trim()) operationValue.description = operation.description.trim();
  operationValue.responses = {};
  if (format === 'json') {
    try {
      const parsed = JSON.parse(source) as unknown;
      if (!isRecord(parsed)) return { source, error: 'The JSON document root must be an object.' };
      const paths = isRecord(parsed.paths) ? parsed.paths : {};
      const pathItem = isRecord(paths[path]) ? paths[path] : {};
      if (pathItem[method])
        return { source, error: `The ${method.toUpperCase()} ${path} operation already exists.` };
      pathItem[method] = operationValue;
      paths[path] = pathItem;
      parsed.paths = paths;
      return { source: `${JSON.stringify(parsed, null, 2)}\n`, error: null };
    } catch {
      return { source, error: 'Fix the JSON parse error before adding an operation.' };
    }
  }
  const lines = source.split(/\r?\n/);
  const pathsLine = lines.findIndex((line) => /^paths\s*:/.test(line));
  if (pathsLine < 0) return { source, error: 'This catalog has no top-level paths object.' };
  const pathsEnd = findBlockEnd(lines, pathsLine);
  const rawPaths = lines[pathsLine]?.slice((lines[pathsLine] ?? '').indexOf(':') + 1).trim();
  const rendered = renderYamlOperation(path, method, operationValue);
  if (rawPaths === '{}') {
    lines.splice(pathsLine, 1, 'paths:', ...rendered);
    return { source: lines.join('\n'), error: null };
  }
  const pathLine = lines.findIndex(
    (line, index) => index > pathsLine && index < pathsEnd && yamlKey(line, 2) === path,
  );
  if (pathLine < 0) {
    lines.splice(pathsEnd, 0, ...rendered);
    return { source: lines.join('\n'), error: null };
  }
  const pathEnd = findIndentedBlockEnd(lines, pathLine, 2, pathsEnd);
  if (locateYamlOperation(lines, path, method)) {
    return { source, error: `The ${method.toUpperCase()} ${path} operation already exists.` };
  }
  lines.splice(pathEnd, 0, ...renderYamlMethod(method, operationValue));
  return { source: lines.join('\n'), error: null };
}

function operationsFromRoot(root: Record<string, unknown>): CatalogOperation[] {
  const paths = isRecord(root.paths) ? root.paths : {};
  return Object.entries(paths).flatMap(([path, pathValue]) => {
    const pathItem = isRecord(pathValue) ? pathValue : {};
    return Object.entries(pathItem)
      .filter(([method]) => HTTP_METHODS.has(method.toLowerCase()))
      .map(([method, value]) => {
        const operation = isRecord(value) ? value : {};
        return {
          path,
          method: method.toLowerCase(),
          operationId: stringValue(operation.operationId),
          summary: stringValue(operation.summary),
          description: stringValue(operation.description),
        };
      });
  });
}

function operationFromRoot(
  root: Record<string, unknown>,
  operation: Pick<CatalogOperation, 'path' | 'method'>,
): Record<string, unknown> | null {
  const paths = isRecord(root.paths) ? root.paths : null;
  const pathItemValue = paths?.[operation.path];
  const pathItem = isRecord(pathItemValue) ? pathItemValue : null;
  const target = pathItem?.[operation.method];
  return isRecord(target) ? target : null;
}

function locateYamlComponentCategory(
  lines: string[],
  type: CatalogComponentType,
): { line: number; end: number } | null {
  const componentsLine = lines.findIndex((line) => /^components\s*:/.test(line));
  if (componentsLine < 0) return null;
  const componentsEnd = findBlockEnd(lines, componentsLine);
  const categoryLine = lines.findIndex(
    (line, index) => index > componentsLine && index < componentsEnd && yamlKey(line, 2) === type,
  );
  if (categoryLine < 0) return null;
  return { line: categoryLine, end: findIndentedBlockEnd(lines, categoryLine, 2, componentsEnd) };
}

function locateYamlOperation(
  lines: string[],
  path: string,
  method: string,
): { pathLine: number; pathEnd: number; methodLine: number; operationEnd: number } | null {
  const pathsLine = lines.findIndex((line) => /^paths\s*:/.test(line));
  if (pathsLine < 0) return null;
  const pathsEnd = findBlockEnd(lines, pathsLine);
  const pathLine = lines.findIndex(
    (line, index) => index > pathsLine && index < pathsEnd && yamlKey(line, 2) === path,
  );
  if (pathLine < 0) return null;
  const pathEnd = findIndentedBlockEnd(lines, pathLine, 2, pathsEnd);
  const methodLine = lines.findIndex(
    (line, index) => index > pathLine && index < pathEnd && yamlKey(line, 4) === method,
  );
  if (methodLine < 0) return null;
  return {
    pathLine,
    pathEnd,
    methodLine,
    operationEnd: findIndentedBlockEnd(lines, methodLine, 4, pathEnd),
  };
}

function renderYamlOperation(
  path: string,
  method: string,
  operation: Record<string, unknown>,
): string[] {
  return [`  ${yamlKeyScalar(path)}:`, ...renderYamlMethod(method, operation)];
}
function renderYamlMethod(method: string, operation: Record<string, unknown>): string[] {
  return [
    `    ${method}:`,
    `      operationId: ${yamlScalar(String(operation.operationId))}`,
    ...(operation.summary ? [`      summary: ${yamlScalar(String(operation.summary))}`] : []),
    ...(operation.description
      ? [`      description: ${yamlScalar(String(operation.description))}`]
      : []),
    '      responses: {}',
  ];
}
function yamlStructuredField(field: CatalogOperationStructuredField, text: string): string[] {
  if (!text) return [];
  if (!text.includes('\n')) return [`      ${field}: ${text}`];
  return [`      ${field}:`, ...text.split(/\r?\n/).map((line) => `        ${line}`)];
}
function yamlComponent(name: string, text: string): string[] {
  if (!text.includes('\n')) return [`    ${yamlKeyScalar(name)}: ${text}`];
  return [`    ${yamlKeyScalar(name)}:`, ...text.split(/\r?\n/).map((line) => `      ${line}`)];
}
function yamlField(lines: string[], methodLine: number, end: number, field: string): string {
  const line = yamlFieldLine(lines, methodLine, end, field);
  if (line < 0) return '';
  const raw = lines[line]?.slice((lines[line] ?? '').indexOf(':') + 1).trim() ?? '';
  return unquote(raw);
}
function yamlFieldLine(lines: string[], methodLine: number, end: number, field: string): number {
  return lines.findIndex(
    (line, index) =>
      index > methodLine &&
      index < end &&
      indentation(line) === 6 &&
      new RegExp(`^\\s*${field}\\s*:`).test(line),
  );
}
function nextYamlField(lines: string[], start: number, end: number, indent: number): number {
  const found = lines.findIndex(
    (line, index) =>
      index >= start &&
      index < end &&
      indentation(line) === indent &&
      /^\s*[A-Za-z][\w-]*\s*:/.test(line),
  );
  return found < 0 ? end : found;
}
function findIndentedBlockEnd(
  lines: string[],
  start: number,
  indent: number,
  limit: number,
): number {
  const found = lines.findIndex(
    (line, index) =>
      index > start && index < limit && line.trim() !== '' && indentation(line) <= indent,
  );
  return found < 0 ? limit : found;
}
function yamlKey(line: string, indent: number): string | null {
  const match = line.match(new RegExp(`^\\s{${indent}}(?!\\s)(['\"]?)([^:]+)\\1\\s*:`));
  return match?.[2]?.trim() ?? null;
}
function yamlKeyScalar(value: string): string {
  return value.includes(':') || value.includes('#') ? yamlScalar(value) : value;
}
function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

const HTTP_METHODS = new Set(['get', 'post', 'put', 'patch', 'delete', 'options', 'head', 'trace']);

function parseServers(text: string): {
  value: Array<Record<string, unknown>>;
  error: string | null;
} {
  try {
    const parsed = JSON.parse(text.trim() || '[]') as unknown;
    if (!Array.isArray(parsed) || parsed.some((item) => !isRecord(item))) {
      return { value: [], error: 'Servers must be a JSON array of objects.' };
    }
    return { value: parsed as Array<Record<string, unknown>>, error: null };
  } catch {
    return { value: [], error: 'Enter servers as a valid JSON array of objects.' };
  }
}

function renderYamlServers(servers: Array<Record<string, unknown>>): string[] {
  if (servers.length === 0) return ['servers: []'];
  return [
    'servers:',
    ...servers.flatMap((server) => {
      const entries = Object.entries(server);
      if (entries.length === 0) return ['  - {}'];
      return entries.map(([key, value], index) => {
        const prefix = index === 0 ? '  - ' : '    ';
        return `${prefix}${key}: ${yamlValue(value)}`;
      });
    }),
  ];
}

function yamlValue(value: unknown): string {
  if (typeof value === 'string') return yamlScalar(value);
  if (value === null) return 'null';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}
function yamlScalar(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}
function findBlockEnd(lines: string[], start: number): number {
  return lines.findIndex((line, index) => index > start && isTopLevelLine(line)) < 0
    ? lines.length
    : lines.findIndex((line, index) => index > start && isTopLevelLine(line));
}
function nextInfoField(lines: string[], start: number, end: number, indent: number): number {
  const found = lines.findIndex(
    (line, index) =>
      index >= start &&
      index < end &&
      indentation(line) === indent &&
      /^(\s*)[A-Za-z][\w-]*\s*:/.test(line),
  );
  return found < 0 ? end : found;
}
function isTopLevelLine(line: string): boolean {
  return line.trim() !== '' && indentation(line) === 0 && /^[A-Za-z][\w-]*\s*:/.test(line);
}
function indentation(line: string): number {
  return line.match(/^\s*/)?.[0].length ?? 0;
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
function record(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
