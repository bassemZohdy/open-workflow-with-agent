export type CatalogPayloadPreview = {
  mediaType: string | null;
  schema: unknown;
  schemaLabel: string;
  example: unknown;
  exampleSource: 'explicit' | 'generated' | 'none';
  description: string | null;
};

export type CatalogOperationPreviews = {
  request: CatalogPayloadPreview | null;
  responses: Array<CatalogPayloadPreview & { status: string }>;
};

type JsonObject = Record<string, unknown>;

export function operationPayloadPreviews(
  root: JsonObject | null,
  operation: JsonObject | null,
): CatalogOperationPreviews {
  if (!operation) return { request: null, responses: [] };
  const requestBody = record(operation.requestBody);
  const request = requestBody ? payloadFromContainer(requestBody, root) : null;
  const responses = record(operation.responses);
  return {
    request,
    responses: Object.entries(responses ?? {}).flatMap(([status, value]) => {
      const response = record(value);
      const payload = response ? payloadFromContainer(response, root) : null;
      return payload ? [{ ...payload, status }] : [];
    }),
  };
}

export function exampleFromSchema(
  schema: unknown,
  root: JsonObject | null = null,
  references = new Set<string>(),
): unknown {
  const candidate = record(schema);
  if (!candidate) return undefined;

  const reference = typeof candidate.$ref === 'string' ? candidate.$ref : null;
  if (reference) {
    if (references.has(reference)) return {};
    const target = resolveLocalReference(root, reference);
    if (!target) return undefined;
    const nextReferences = new Set(references);
    nextReferences.add(reference);
    return exampleFromSchema(target, root, nextReferences);
  }

  const explicit = explicitExample(candidate);
  if (explicit?.found) return explicit.value;

  const alternatives = [...array(candidate.oneOf), ...array(candidate.anyOf)];
  if (alternatives.length > 0) return exampleFromSchema(alternatives[0], root, references);

  const allOf = array(candidate.allOf);
  if (allOf.length > 0) {
    const merged = allOf.reduce<JsonObject | null>((result, item) => {
      const value = exampleFromSchema(item, root, references);
      if (!isObject(value))
        return result ?? (value === undefined ? null : ({ value } as JsonObject));
      return { ...(result ?? {}), ...value };
    }, null);
    if (merged) return merged;
  }

  const type = typeof candidate.type === 'string' ? candidate.type : null;
  if (type === 'object' || candidate.properties !== undefined) {
    const properties = record(candidate.properties);
    if (!properties) return {};
    const names = Object.keys(properties);
    return Object.fromEntries(
      names.slice(0, 40).flatMap((name) => {
        const value = exampleFromSchema(properties[name], root, references);
        return value === undefined ? [] : [[name, value]];
      }),
    );
  }
  if (type === 'array' || candidate.items !== undefined) {
    const item = exampleFromSchema(candidate.items, root, references);
    return item === undefined ? [] : [item];
  }
  if (type === 'integer' || type === 'number') return 0;
  if (type === 'boolean') return false;
  if (type === 'string' || type === null) {
    const format = typeof candidate.format === 'string' ? candidate.format : '';
    if (format === 'date') return '2026-01-01';
    if (format === 'date-time') return '2026-01-01T00:00:00Z';
    if (format === 'email') return 'user@example.com';
    if (format === 'uri' || format === 'url') return 'https://example.test';
    return 'string';
  }
  return undefined;
}

export function schemaPreviewLabel(schema: unknown, root: JsonObject | null = null): string {
  const resolved = resolveSchema(schema, root);
  if (!resolved) return 'No schema declared';
  const type = typeof resolved.type === 'string' ? resolved.type : null;
  const properties = record(resolved.properties);
  const required = array(resolved.required).filter(isString);
  const parts = [type ?? (properties ? 'object' : 'schema')];
  if (properties)
    parts.push(
      `${Object.keys(properties).length} propert${Object.keys(properties).length === 1 ? 'y' : 'ies'}`,
    );
  if (required.length > 0) parts.push(`${required.length} required`);
  if (typeof resolved.$ref === 'string') parts.push(resolved.$ref);
  return parts.join(' · ');
}

export function resolveLocalReference(root: JsonObject | null, reference: string): unknown {
  if (!root || !reference.startsWith('#/')) return undefined;
  return reference
    .slice(2)
    .split('/')
    .map((part) => part.replace(/~1/g, '/').replace(/~0/g, '~'))
    .reduce<unknown>((value, part) => (isObject(value) ? value[part] : undefined), root);
}

function payloadFromContainer(
  container: JsonObject,
  root: JsonObject | null,
): CatalogPayloadPreview | null {
  const content = record(container.content);
  const media = chooseMedia(content);
  const source = media?.value ?? container;
  const sourceObject = record(source) ?? container;
  const schema = source === container ? container.schema : sourceObject.schema;
  const explicit = explicitExample(sourceObject) ?? explicitExample(container);
  const generated = explicit?.found ? explicit.value : exampleFromSchema(schema, root);
  const exampleSource = explicit?.found
    ? 'explicit'
    : generated === undefined
      ? 'none'
      : 'generated';
  if (!media && schema === undefined && !explicit?.found && generated === undefined) return null;
  return {
    mediaType: media?.mediaType ?? null,
    schema,
    schemaLabel: schemaPreviewLabel(schema, root),
    example: generated,
    exampleSource,
    description: typeof container.description === 'string' ? container.description : null,
  };
}

function chooseMedia(content: JsonObject | null): { mediaType: string; value: unknown } | null {
  if (!content) return null;
  const preferred = Object.keys(content).find((key) => key.toLowerCase() === 'application/json');
  const mediaType = preferred ?? Object.keys(content)[0];
  return mediaType ? { mediaType, value: content[mediaType] } : null;
}

function resolveSchema(schema: unknown, root: JsonObject | null): JsonObject | null {
  const candidate = record(schema);
  if (!candidate || typeof candidate.$ref !== 'string') return candidate;
  const target = resolveLocalReference(root, candidate.$ref);
  return record(target) ?? candidate;
}

function explicitExample(value: JsonObject): { found: boolean; value: unknown } | null {
  if (Object.prototype.hasOwnProperty.call(value, 'example')) {
    return { found: true, value: value.example };
  }
  if (Object.prototype.hasOwnProperty.call(value, 'default')) {
    return { found: true, value: value.default };
  }
  if (Object.prototype.hasOwnProperty.call(value, 'const')) {
    return { found: true, value: value.const };
  }
  if (Array.isArray(value.enum) && value.enum.length > 0) {
    return { found: true, value: value.enum[0] };
  }
  const examples = value.examples;
  if (isObject(examples)) {
    const first = Object.values(examples)[0];
    if (isObject(first) && Object.prototype.hasOwnProperty.call(first, 'value')) {
      return { found: true, value: first.value };
    }
    if (first !== undefined) return { found: true, value: first };
  }
  if (Array.isArray(examples) && examples.length > 0) {
    return { found: true, value: examples[0] };
  }
  return null;
}

function record(value: unknown): JsonObject | null {
  return isObject(value) ? value : null;
}

function isObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}
