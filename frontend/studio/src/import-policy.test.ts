import { describe, expect, it } from 'vitest';

import { importPolicy, MAX_IMPORT_BYTES } from './import-policy';

describe('import policy', () => {
  it('accepts local OpenAPI YAML and JSON with matching content types', () => {
    expect(importPolicy('service.yaml', 'application/yaml', 100)).toEqual({
      kind: 'catalog',
      format: 'yaml',
      error: null,
    });
    expect(importPolicy('service.json', 'application/json', 100)).toEqual({
      kind: 'catalog',
      format: 'json',
      error: null,
    });
  });

  it('rejects oversized, unsupported, and mismatched imports', () => {
    expect(importPolicy('service.yaml', 'application/yaml', MAX_IMPORT_BYTES + 1).error).toContain(
      '2 MiB',
    );
    expect(importPolicy('service.txt', 'text/plain', 100).error).toContain('Only OpenAPI');
    expect(importPolicy('service.json', 'application/yaml', 100).error).toContain('does not match');
  });

  it('keeps the existing workflow import classification explicit', () => {
    expect(importPolicy('review.sw.yaml', 'application/yaml', 100)).toEqual({
      kind: 'workflow',
      format: 'yaml',
      error: null,
    });
  });
});
