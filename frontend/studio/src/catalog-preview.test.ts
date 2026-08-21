import { describe, expect, it } from 'vitest';

import {
  exampleFromSchema,
  operationPayloadPreviews,
  resolveLocalReference,
  schemaPreviewLabel,
} from './catalog-preview';

describe('catalog schema previews', () => {
  const root = {
    components: {
      schemas: {
        Message: {
          type: 'object',
          required: ['role', 'content'],
          properties: {
            role: { type: 'string', enum: ['user', 'assistant'] },
            content: { type: 'string' },
          },
        },
        Request: {
          type: 'object',
          required: ['message'],
          properties: {
            message: { $ref: '#/components/schemas/Message' },
            count: { type: 'integer', default: 2 },
          },
        },
      },
    },
  };

  it('resolves local JSON pointers and generates required nested examples', () => {
    expect(resolveLocalReference(root, '#/components/schemas/Message')).toEqual(
      root.components.schemas.Message,
    );
    expect(exampleFromSchema({ $ref: '#/components/schemas/Request' }, root)).toEqual({
      message: { role: 'user', content: 'string' },
      count: 2,
    });
    expect(schemaPreviewLabel({ $ref: '#/components/schemas/Request' }, root)).toContain('object');
  });

  it('prefers explicit media examples and derives request and response previews', () => {
    const previews = operationPayloadPreviews(root, {
      requestBody: {
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/Request' },
          },
        },
      },
      responses: {
        '200': {
          description: 'Created',
          content: {
            'application/json': {
              schema: { type: 'object', properties: { ok: { type: 'boolean' } } },
              example: { ok: true },
            },
          },
        },
        '204': { description: 'No content' },
      },
    });

    expect(previews.request?.mediaType).toBe('application/json');
    expect(previews.request?.exampleSource).toBe('generated');
    expect(previews.request?.example).toEqual({
      message: { role: 'user', content: 'string' },
      count: 2,
    });
    expect(previews.responses).toHaveLength(1);
    expect(previews.responses[0]?.status).toBe('200');
    expect(previews.responses[0]?.example).toEqual({ ok: true });
    expect(previews.responses[0]?.exampleSource).toBe('explicit');
  });

  it('does not invent an example for an unresolved local reference', () => {
    expect(exampleFromSchema({ $ref: '#/components/schemas/Missing' }, root)).toBeUndefined();
  });
});
