import { describe, expect, it } from 'vitest';

import {
  addCatalogComponent,
  addCatalogOperation,
  catalogComponentNamesFromSource,
  catalogComponentText,
  catalogOperationStructuredText,
  catalogOperationsFromSource,
  catalogMetadataFromSource,
  catalogServersText,
  patchCatalogOperation,
  patchCatalogOperationStructured,
  patchCatalogComponent,
  patchCatalogMetadata,
  patchCatalogServers,
  removeCatalogOperation,
} from './catalog-patch';
import type { DocumentResponse } from './workspace';

const yamlDocument = { format: 'yaml' } as DocumentResponse;

const yamlSource = `openapi: 3.0.3
info:
  title: Old title
  version: '1.0'
  description: Old description
servers:
  - url: /
paths: {}
x-extension: retained
`;

describe('catalog source patches', () => {
  it('reads and updates YAML metadata without removing unrelated fields', () => {
    expect(catalogMetadataFromSource(yamlDocument, yamlSource, 'title')).toBe('Old title');

    const result = patchCatalogMetadata(yamlSource, 'yaml', 'title', 'New title');

    expect(result.error).toBeNull();
    expect(result.source).toContain("title: 'New title'");
    expect(result.source).toContain('paths: {}');
    expect(result.source).toContain('x-extension: retained');
  });

  it('replaces YAML servers from a JSON form value and preserves paths', () => {
    const result = patchCatalogServers(
      yamlSource,
      'yaml',
      JSON.stringify([{ url: 'https://api.example.test', description: 'API' }]),
    );

    expect(result.error).toBeNull();
    expect(result.source).toContain("url: 'https://api.example.test'");
    expect(result.source).toContain("description: 'API'");
    expect(result.source).toContain('paths: {}');
    expect(catalogServersText(yamlDocument, result.source)).toContain('https://api.example.test');
  });

  it('updates JSON info and servers while retaining extension data', () => {
    const source = JSON.stringify(
      {
        openapi: '3.0.3',
        info: { title: 'Old', version: '1.0' },
        paths: {},
        'x-extension': { retained: true },
      },
      null,
      2,
    );
    const metadata = patchCatalogMetadata(source, 'json', 'description', 'New description');
    const servers = patchCatalogServers(
      metadata.source,
      'json',
      JSON.stringify([{ url: 'https://api.example.test' }]),
    );
    const parsed = JSON.parse(servers.source) as Record<string, unknown>;

    expect((parsed.info as Record<string, unknown>).description).toBe('New description');
    expect(parsed.servers).toEqual([{ url: 'https://api.example.test' }]);
    expect(parsed['x-extension']).toEqual({ retained: true });
  });

  it('rejects malformed server input without changing the source', () => {
    const result = patchCatalogServers(yamlSource, 'yaml', '{not-json}');

    expect(result.source).toBe(yamlSource);
    expect(result.error).toBe('Enter servers as a valid JSON array of objects.');
  });

  it('lists and edits YAML operation fields without disturbing request and response data', () => {
    const operations = catalogOperationsFromSource(
      yamlDocument,
      yamlSource.replace(
        'paths: {}',
        `paths:
  /items:
    get:
      operationId: listItems
      summary: List items
      responses:
        '200':
          description: OK`,
      ),
    );
    expect(operations).toEqual([
      {
        path: '/items',
        method: 'get',
        operationId: 'listItems',
        summary: 'List items',
        description: '',
      },
    ]);

    const result = patchCatalogOperation(
      yamlSource.replace(
        'paths: {}',
        `paths:
  /items:
    get:
      operationId: listItems
      summary: List items
      responses:
        '200':
          description: OK`,
      ),
      'yaml',
      { path: '/items', method: 'get' },
      'summary',
      'List all items',
    );
    expect(result.error).toBeNull();
    expect(result.source).toContain("summary: 'List all items'");
    expect(result.source).toContain("'200':");
  });

  it('creates a YAML operation and rejects duplicate operation IDs', () => {
    const result = addCatalogOperation(yamlSource, 'yaml', {
      path: '/items',
      method: 'get',
      operationId: 'listItems',
      summary: 'List items',
      description: '',
    });
    expect(result.error).toBeNull();
    expect(result.source).toContain('  /items:');
    expect(result.source).toContain("operationId: 'listItems'");
    expect(result.source).toContain('responses: {}');

    const duplicate = addCatalogOperation(result.source, 'yaml', {
      path: '/other',
      method: 'post',
      operationId: 'listItems',
      summary: '',
      description: '',
    });
    expect(duplicate.source).toBe(result.source);
    expect(duplicate.error).toContain('already used');
  });

  it('updates JSON operations while retaining nested response data', () => {
    const source = JSON.stringify(
      {
        openapi: '3.0.3',
        info: { title: 'Catalog', version: '1.0' },
        paths: { '/items': { get: { operationId: 'listItems', responses: { '200': {} } } } },
      },
      null,
      2,
    );
    const result = patchCatalogOperation(
      source,
      'json',
      { path: '/items', method: 'get' },
      'operationId',
      'getItems',
    );
    const parsed = JSON.parse(result.source) as {
      paths: Record<string, { get: { operationId: string; responses: Record<string, unknown> } }>;
    };
    expect(parsed.paths['/items']?.get.operationId).toBe('getItems');
    expect(parsed.paths['/items']?.get.responses).toEqual({ '200': {} });
  });

  it('deletes YAML and JSON operations while retaining sibling and path-level data', () => {
    const yamlWithOperations = yamlSource.replace(
      'paths: {}',
      `paths:
  /items:
    parameters:
      - name: trace
        in: header
    get:
      operationId: listItems
      responses: {}
    post:
      operationId: createItem
      responses: {}
`,
    );
    const yamlResult = removeCatalogOperation(yamlWithOperations, 'yaml', {
      path: '/items',
      method: 'get',
    });
    expect(yamlResult.error).toBeNull();
    expect(yamlResult.source).not.toContain('operationId: listItems');
    expect(yamlResult.source).toContain('operationId: createItem');
    expect(yamlResult.source).toContain('name: trace');

    const jsonSource = JSON.stringify(
      {
        openapi: '3.0.3',
        info: { title: 'Catalog', version: '1.0' },
        paths: {
          '/items': {
            parameters: [{ name: 'trace', in: 'header' }],
            get: { operationId: 'listItems' },
            post: { operationId: 'createItem' },
          },
        },
      },
      null,
      2,
    );
    const jsonResult = removeCatalogOperation(jsonSource, 'json', {
      path: '/items',
      method: 'get',
    });
    const parsed = JSON.parse(jsonResult.source) as {
      paths: Record<string, Record<string, unknown>>;
    };
    expect(jsonResult.error).toBeNull();
    expect(parsed.paths['/items']?.get).toBeUndefined();
    expect(parsed.paths['/items']?.post).toEqual({ operationId: 'createItem' });
    expect(parsed.paths['/items']?.parameters).toEqual([{ name: 'trace', in: 'header' }]);
  });

  it('edits YAML response fragments without removing neighboring operation fields', () => {
    const source = yamlSource.replace(
      'paths: {}',
      `paths:
  /items:
    get:
      operationId: listItems
      requestBody:
        required: true
      responses:
        '200':
          description: OK
      x-operation: retained`,
    );
    const current = catalogOperationStructuredText(
      yamlDocument,
      source,
      { path: '/items', method: 'get' },
      'responses',
    );
    expect(current).toContain("'200':");
    const result = patchCatalogOperationStructured(
      source,
      'yaml',
      { path: '/items', method: 'get' },
      'responses',
      "'201':\n  description: Created",
    );
    expect(result.error).toBeNull();
    expect(result.source).toContain("'201':");
    expect(result.source).toContain('requestBody:');
    expect(result.source).toContain('x-operation: retained');
    expect(result.source).not.toContain("'200':");
  });

  it('validates JSON structured fields before changing the source', () => {
    const source = JSON.stringify(
      {
        openapi: '3.0.3',
        info: { title: 'Catalog', version: '1.0' },
        paths: { '/items': { get: { operationId: 'listItems', responses: {} } } },
      },
      null,
      2,
    );
    const result = patchCatalogOperationStructured(
      source,
      'json',
      { path: '/items', method: 'get' },
      'parameters',
      '{}',
    );
    expect(result.source).toBe(source);
    expect(result.error).toBe('Parameters must be a JSON array.');
  });

  it('creates and edits YAML reusable components while retaining sibling definitions', () => {
    const source = yamlSource.replace(
      'x-extension: retained',
      `components:
  schemas:
    Existing:
      type: object
      properties:
        id:
          type: string
  securitySchemes: {}
x-extension: retained`,
    );
    expect(catalogComponentNamesFromSource(yamlDocument, source, 'schemas')).toEqual(['Existing']);
    expect(catalogComponentText(yamlDocument, source, 'schemas', 'Existing')).toContain(
      'type: object',
    );
    const edited = patchCatalogComponent(
      source,
      'yaml',
      'schemas',
      'Existing',
      'type: object\nproperties:\n  name:\n    type: string',
    );
    expect(edited.error).toBeNull();
    expect(edited.source).toContain('name:');
    expect(edited.source).toContain('securitySchemes: {}');
    const added = addCatalogComponent(edited.source, 'yaml', 'schemas', 'Created', 'type: string');
    expect(added.error).toBeNull();
    expect(added.source).toContain('Created: type: string');
    expect(added.source).toContain('Existing:');
  });

  it('creates and updates JSON components without discarding other components', () => {
    const source = JSON.stringify(
      {
        openapi: '3.0.3',
        info: { title: 'Catalog', version: '1.0' },
        paths: {},
        components: { schemas: { Existing: { type: 'object' } } },
      },
      null,
      2,
    );
    const added = addCatalogComponent(source, 'json', 'schemas', 'Created', '{"type":"string"}');
    expect(added.error).toBeNull();
    const edited = patchCatalogComponent(
      added.source,
      'json',
      'schemas',
      'Created',
      '{"type":"integer"}',
    );
    const parsed = JSON.parse(edited.source) as {
      components: { schemas: Record<string, { type: string }> };
    };
    expect(parsed.components.schemas.Existing?.type).toBe('object');
    expect(parsed.components.schemas.Created?.type).toBe('integer');
  });

  it('creates and edits non-schema reusable component categories in YAML and JSON', () => {
    const yaml = `openapi: 3.0.3
info:
  title: Catalog
  version: '1.0'
paths: {}
components:
  parameters:
    Trace:
      name: trace
      in: header
  responses: {}
x-retained: true
`;
    expect(catalogComponentNamesFromSource(yamlDocument, yaml, 'parameters')).toEqual(['Trace']);
    const edited = patchCatalogComponent(
      yaml,
      'yaml',
      'parameters',
      'Trace',
      `name: request-trace
in: header`,
    );
    expect(edited.error).toBeNull();
    expect(edited.source).toContain('name: request-trace');
    const added = addCatalogComponent(edited.source, 'yaml', 'responses', 'Created', '{}');
    expect(added.error).toBeNull();
    expect(added.source).toContain('Created: {}');
    expect(added.source).toContain('x-retained: true');

    const json = JSON.stringify({
      openapi: '3.0.3',
      info: { title: 'Catalog', version: '1.0' },
      paths: {},
      components: { requestBodies: { Payload: { required: true } } },
    });
    const jsonAdded = addCatalogComponent(json, 'json', 'links', 'Self', '{}');
    expect(jsonAdded.error).toBeNull();
    const parsed = JSON.parse(jsonAdded.source) as {
      components: { requestBodies: Record<string, unknown>; links: Record<string, unknown> };
    };
    expect(parsed.components.requestBodies.Payload).toEqual({ required: true });
    expect(parsed.components.links.Self).toEqual({});
  });
});
