import { describe, expect, it } from 'vitest';

import {
  addCatalogAlias,
  applyDefinitionField,
  applyDefinitionOperation,
  catalogAliasDefinitions,
  catalogAliasReferenceDetails,
  deleteCatalogAlias,
  patchCatalogAlias,
  definitionFieldText,
  definitionReferenceLabels,
  parseDefinitions,
} from './definition-patch';

const yaml = `id: demo
events:
  - name: Completed
    source: app
    type: done
errors:
  - name: Failed
    code: "500"
functions:
  - name: callService
    operation: catalog#call
states:
  - name: Call
    type: operation
    actions:
      - functionRef:
          refName: callService
        eventRef: Completed
    onErrors:
      - errorRef: Failed
        transition: End
`;

describe('definition patching', () => {
  it('reads workflow-uri-definitions aliases from YAML and JSON', () => {
    const aliases = catalogAliasDefinitions(
      `extensions:
  - extensionid: workflow-uri-definitions
    definitions:
      agentCatalog: classpath:/catalogs/agent-rest.yaml
      openaiCatalog: classpath:/catalogs/openai-compatible.yaml
`,
      'yaml',
    );
    expect(aliases).toEqual({
      agentCatalog: 'classpath:/catalogs/agent-rest.yaml',
      openaiCatalog: 'classpath:/catalogs/openai-compatible.yaml',
    });
    expect(
      catalogAliasDefinitions(
        JSON.stringify({
          extensions: [
            {
              extensionid: 'workflow-uri-definitions',
              definitions: { demo: 'classpath:/catalogs/demo.yaml' },
            },
          ],
        }),
        'json',
      ),
    ).toEqual({ demo: 'classpath:/catalogs/demo.yaml' });
  });

  it('creates and retargets YAML catalog aliases without removing workflow fields', () => {
    const source = `id: demo
extensions:
  - extensionid: workflow-uri-definitions
    definitions:
      demoCatalog: classpath:/catalogs/demo.yaml
states:
  - name: End
    type: end
`;
    const patched = patchCatalogAlias(
      source,
      'yaml',
      'demoCatalog',
      'classpath:/catalogs/updated.yaml',
    );
    expect(patched.error).toBeNull();
    expect(patched.source).toContain("demoCatalog: 'classpath:/catalogs/updated.yaml'");
    const added = addCatalogAlias(
      patched.source,
      'yaml',
      'newCatalog',
      'classpath:/catalogs/new.yaml',
    );
    expect(added.error).toBeNull();
    expect(added.source).toContain("newCatalog: 'classpath:/catalogs/new.yaml'");
    expect(added.source).toContain('states:');
  });

  it('creates and retargets JSON catalog aliases', () => {
    const source = JSON.stringify({
      extensions: [
        {
          extensionid: 'workflow-uri-definitions',
          definitions: { demoCatalog: 'classpath:/catalogs/demo.yaml' },
        },
      ],
      states: [],
    });
    const patched = patchCatalogAlias(
      source,
      'json',
      'demoCatalog',
      'classpath:/catalogs/updated.yaml',
    );
    const added = addCatalogAlias(
      patched.source,
      'json',
      'newCatalog',
      'classpath:/catalogs/new.yaml',
    );
    expect(added.error).toBeNull();
    expect(catalogAliasDefinitions(added.source, 'json')).toEqual({
      demoCatalog: 'classpath:/catalogs/updated.yaml',
      newCatalog: 'classpath:/catalogs/new.yaml',
    });
  });

  it('reviews and explicitly accepts breaking catalog alias deletion', () => {
    const source = `id: demo
extensions:
  - extensionid: workflow-uri-definitions
    definitions:
      catalog: classpath:/catalogs/demo.yaml
      spare: classpath:/catalogs/spare.yaml
functions:
  - name: callService
    operation: catalog#call
states: []
`;
    const references = catalogAliasReferenceDetails(source, 'yaml', 'catalog');
    expect(references).toEqual([{ label: 'operation on line 9', line: 9 }]);

    const blocked = deleteCatalogAlias(source, 'yaml', 'catalog');
    expect(blocked.source).toBe(source);
    expect(blocked.error).toContain('operation on line 9');

    const accepted = deleteCatalogAlias(source, 'yaml', 'catalog', true);
    expect(accepted.error).toBeNull();
    expect(accepted.source).not.toContain('catalog: classpath:/catalogs/demo.yaml');
    expect(accepted.source).toContain('spare: classpath:/catalogs/spare.yaml');
    expect(accepted.source).toContain('operation: catalog#call');

    const json = JSON.stringify({
      extensions: [
        {
          extensionid: 'workflow-uri-definitions',
          definitions: { catalog: 'classpath:/catalogs/demo.json' },
        },
      ],
      functions: [{ name: 'callService', operation: 'catalog#call' }],
    });
    expect(catalogAliasReferenceDetails(json, 'json', 'catalog')).toEqual([
      { label: 'operation at $.functions[0].operation', line: null },
    ]);
  });

  it('parses all reusable definition collections without nested name collisions', () => {
    expect(parseDefinitions(yaml, 'yaml', 'functions')).toEqual([
      expect.objectContaining({ name: 'callService', index: 0 }),
    ]);
    expect(parseDefinitions(yaml, 'yaml', 'events')).toEqual([
      expect.objectContaining({ name: 'Completed', index: 0 }),
    ]);
    expect(parseDefinitions(yaml, 'yaml', 'errors')).toEqual([
      expect.objectContaining({ name: 'Failed', index: 0 }),
    ]);
  });

  it('renames definitions and updates references', () => {
    const result = applyDefinitionOperation(yaml, 'yaml', {
      kind: 'rename',
      collection: 'functions',
      index: 0,
      name: 'invokeService',
    });
    expect(result.error).toBeNull();
    expect(result.source).toMatch(/name: ['"]?invokeService['"]?/);
    expect(result.source).toMatch(/refName: ['"]?invokeService['"]?/);
  });

  it('reports usage and blocks deletion of referenced definitions', () => {
    const references = definitionReferenceLabels(yaml, 'yaml', 'events', 'Completed');
    expect(references).toContain('eventRef on line 18');
    const result = applyDefinitionOperation(yaml, 'yaml', {
      kind: 'delete',
      collection: 'events',
      index: 0,
    });
    expect(result.source).toBe(yaml);
    expect(result.error).toContain('Cannot delete “Completed”');
  });

  it('creates, reorders, and edits definitions while preserving other collections', () => {
    const created = applyDefinitionOperation(yaml, 'yaml', {
      kind: 'create',
      collection: 'errors',
      name: 'NewError',
    });
    expect(created.error).toBeNull();
    expect(created.source).toContain("- name: 'NewError'");
    const field = applyDefinitionField(created.source, 'yaml', 'errors', 1, 'code', '422');
    expect(field.error).toBeNull();
    expect(field.source).toMatch(/code: ['"]?422['"]?/);
    const moved = applyDefinitionOperation(field.source, 'yaml', {
      kind: 'move',
      collection: 'errors',
      index: 1,
      direction: 'up',
    });
    expect(parseDefinitions(moved.source, 'yaml', 'errors')[0]?.name).toBe('NewError');
    expect(moved.source).toContain('functions:');
  });

  it('preserves JSON definition fields during rename and field edits', () => {
    const source = JSON.stringify({
      functions: [{ name: 'callService', operation: 'catalog#call', custom: { keep: true } }],
      states: [{ name: 'Call', functionRef: { refName: 'callService' } }],
    });
    const renamed = applyDefinitionOperation(source, 'json', {
      kind: 'rename',
      collection: 'functions',
      index: 0,
      name: 'invokeService',
    });
    expect(JSON.parse(renamed.source).states[0].functionRef.refName).toBe('invokeService');
    const edited = applyDefinitionField(
      renamed.source,
      'json',
      'functions',
      0,
      'operation',
      'catalog#updated',
    );
    expect(definitionFieldText(edited.source, 'json', 'functions', 0, 'operation')).toBe(
      'catalog#updated',
    );
    expect(JSON.parse(edited.source).functions[0].custom).toEqual({ keep: true });
  });
});
