import { describe, expect, it } from 'vitest';

import {
  patchMetadataSource,
  scalarMetadataFromSource,
  structuredMetadataText,
  topLevelKeysFromSource,
} from './metadata-patch';
import { type DocumentResponse } from './workspace';

describe('metadata source patching', () => {
  it('updates YAML metadata while retaining comments, unknown keys, and nested fields', () => {
    const source = `id: old\nname: Old\ndescription: >-\n  Existing description\ncustomField: retained\nstart: Begin\nstates:\n  - name: Begin\n    type: inject\n`;
    const updated = patchMetadataSource(source, 'yaml', {
      name: "Owner's Workflow",
      description: 'Updated description',
      start: 'Begin',
    });
    expect(updated).toContain("name: 'Owner''s Workflow'");
    expect(updated).toContain("description: 'Updated description'");
    expect(updated).toContain('customField: retained');
    expect(updated).toContain('states:');
    expect(
      scalarMetadataFromSource({ format: 'yaml' } as DocumentResponse, source, 'description'),
    ).toBe('Existing description');
  });

  it('updates JSON fields without dropping unknown properties', () => {
    const source = '{"id":"old","custom":{"keep":true},"start":"Begin"}\n';
    const updated = patchMetadataSource(source, 'json', { id: 'new', keepActive: true });
    const parsed = JSON.parse(updated) as Record<string, unknown>;
    expect(parsed.id).toBe('new');
    expect(parsed.keepActive).toBe(true);
    expect(parsed.custom).toEqual({ keep: true });
  });

  it('projects structured fields and unknown keys from the active draft', () => {
    const source = `id: demo\ntimeouts:\n  actionExecTimeout: PT5S\ncustomField: retained\nstates:\n  - name: Start\n    type: inject\n`;
    expect(structuredMetadataText({ format: 'yaml' } as DocumentResponse, source, 'timeouts')).toBe(
      'actionExecTimeout: PT5S',
    );
    expect(topLevelKeysFromSource(source, 'yaml')).toEqual([
      'id',
      'timeouts',
      'customField',
      'states',
    ]);
  });
});
