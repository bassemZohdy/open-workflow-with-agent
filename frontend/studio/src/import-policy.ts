export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;

export type ImportPolicy = {
  kind: 'workflow' | 'catalog';
  format: 'yaml' | 'json';
  error: string | null;
};

const yamlMimeTypes = new Set(['application/yaml', 'application/x-yaml', 'text/yaml']);
const jsonMimeTypes = new Set(['application/json', 'text/json']);

export function importPolicy(name: string, mimeType: string, sizeBytes: number): ImportPolicy {
  const lowerName = name.trim().toLowerCase();
  const normalizedMime = mimeType.trim().toLowerCase().split(';', 1)[0] ?? '';
  if (!name.trim()) return invalidImport('Choose a file to import.');
  if (sizeBytes > MAX_IMPORT_BYTES) {
    return invalidImport('The import exceeds the 2 MiB Studio limit.');
  }
  const kind = lowerName.endsWith('.sw.yaml') ? 'workflow' : 'catalog';
  const format = lowerName.endsWith('.json') ? 'json' : 'yaml';
  const supportedExtension =
    kind === 'workflow'
      ? lowerName.endsWith('.sw.yaml')
      : lowerName.endsWith('.yaml') || lowerName.endsWith('.yml') || lowerName.endsWith('.json');
  if (!supportedExtension) {
    return invalidImport('Only OpenAPI .yaml, .yml, and .json files can be imported.');
  }
  if (normalizedMime && !mimeAllowed(format, normalizedMime)) {
    return invalidImport(
      `The file content type ${mimeType} does not match its ${format.toUpperCase()} extension.`,
    );
  }
  return { kind, format, error: null };
}

function mimeAllowed(format: 'yaml' | 'json', mimeType: string): boolean {
  return format === 'json' ? jsonMimeTypes.has(mimeType) : yamlMimeTypes.has(mimeType);
}

function invalidImport(error: string): ImportPolicy {
  return { kind: 'catalog', format: 'yaml', error };
}
