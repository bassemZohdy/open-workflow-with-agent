import { describe, expect, it } from 'vitest';

import {
  applyStateField,
  applyStateDeletions,
  applyStateOperation,
  applyTransitionConnection,
  parseStateSummaries,
  stateFieldKeys,
  stateFieldText,
} from './state-patch';

const yaml = `start: Start
states:
  - name: Start
    type: inject
    x-custom: keep-me
    transition: Finish
  - name: Finish
    type: operation
    end: true
  - name: Orphan
    type: inject
    end: true
`;

const advancedYaml = `start: Start
states:
  - name: Start
    type: inject
    data:
      original: true
    stateDataFilter:
      output: .result
    x-custom: keep-me
  - name: Call
    type: operation
    actions:
      - name: Invoke
        retryRef: retry-once
        sleep: PT1S
        actionDataFilter:
          toStateData: .result
    onErrors:
      - errorRef: KnownError
        transition: End
    end: true
`;

describe('state patching', () => {
  it('parses state order and direct lifecycle fields', () => {
    expect(parseStateSummaries(yaml, 'yaml')).toEqual([
      expect.objectContaining({
        name: 'Start',
        type: 'inject',
        transition: 'Finish',
        end: false,
        index: 0,
      }),
      expect.objectContaining({
        name: 'Finish',
        type: 'operation',
        transition: null,
        end: true,
        index: 1,
      }),
      expect.objectContaining({
        name: 'Orphan',
        type: 'inject',
        transition: null,
        end: true,
        index: 2,
      }),
    ]);
  });

  it('renames a state and updates start and transition references', () => {
    const result = applyStateOperation(yaml, 'yaml', { kind: 'rename', index: 1, name: 'Done' });
    expect(result.error).toBeNull();
    expect(result.source).toMatch(/transition: ['"]?Done['"]?/);
    expect(result.source).toMatch(/- name: ['"]?Done['"]?/);
    expect(result.source).toContain('x-custom: keep-me');
  });

  it('blocks deletion while references would dangle', () => {
    const result = applyStateOperation(yaml, 'yaml', { kind: 'delete', index: 1 });
    expect(result.source).toBe(yaml);
    expect(result.error).toContain('Cannot delete “Finish”');
  });

  it('duplicates, reorders, and deletes an unreferenced state', () => {
    const duplicate = applyStateOperation(yaml, 'yaml', {
      kind: 'duplicate',
      index: 0,
      name: 'Start Copy',
    });
    expect(duplicate.error).toBeNull();
    expect(duplicate.source).toContain('x-custom: keep-me');
    const moved = applyStateOperation(duplicate.source, 'yaml', {
      kind: 'move',
      index: 3,
      direction: 'up',
    });
    expect(parseStateSummaries(moved.source, 'yaml')[2]?.name).toBe('Orphan');
    const deleted = applyStateOperation(moved.source, 'yaml', { kind: 'delete', index: 2 });
    expect(deleted.error).toBeNull();
    expect(deleted.source).not.toContain('- name: Orphan');
  });

  it('preserves unknown JSON state fields during supported edits', () => {
    const source = JSON.stringify({
      start: 'Start',
      states: [{ name: 'Start', type: 'inject', custom: { keep: true } }],
    });
    const result = applyStateOperation(source, 'json', {
      kind: 'edit',
      index: 0,
      type: 'operation',
      end: true,
    });
    expect(result.error).toBeNull();
    expect(JSON.parse(result.source).states[0]).toMatchObject({
      type: 'operation',
      end: true,
      custom: { keep: true },
    });
  });

  it('patches nested YAML fields while preserving sibling and unknown fields', () => {
    expect(stateFieldText(advancedYaml, 'yaml', 1, 'actions')).toContain('retryRef: retry-once');
    expect(stateFieldKeys(advancedYaml, 'yaml', 1)).toEqual(
      expect.arrayContaining(['type', 'actions', 'onErrors', 'end']),
    );
    const result = applyStateField(
      advancedYaml,
      'yaml',
      0,
      'data',
      '{"message":"updated","count":2}',
    );
    expect(result.error).toBeNull();
    expect(result.source).toContain('data: {"message":"updated","count":2}');
    expect(result.source).toContain('stateDataFilter:');
    expect(result.source).toContain('x-custom: keep-me');
  });

  it('patches JSON fields without dropping other state properties', () => {
    const source = JSON.stringify({
      states: [{ name: 'Start', type: 'inject', data: { before: true }, custom: { keep: true } }],
    });
    const result = applyStateField(source, 'json', 0, 'data', '{"after":true}');
    expect(result.error).toBeNull();
    expect(JSON.parse(result.source).states[0]).toMatchObject({
      data: { after: true },
      custom: { keep: true },
    });
  });

  it('creates a direct graph connection while preserving source fields', () => {
    const result = applyTransitionConnection(yaml, 'yaml', 'Orphan', 'Finish');
    expect(result.error).toBeNull();
    expect(result.source).toContain('x-custom: keep-me');
    expect(parseStateSummaries(result.source, 'yaml')[2]?.transition).toBe('Finish');
  });

  it('rejects self-connections and unknown graph endpoints', () => {
    expect(applyTransitionConnection(yaml, 'yaml', 'Start', 'Start').error).toContain(
      'cannot transition to itself',
    );
    expect(applyTransitionConnection(yaml, 'yaml', 'Missing', 'Finish').error).toContain(
      'Source state',
    );
    expect(applyTransitionConnection(yaml, 'yaml', 'Start', 'Missing').error).toContain(
      'Target state',
    );
  });

  it('deletes multiple unreferenced states transactionally', () => {
    const deleted = applyStateDeletions(yaml, 'yaml', ['Orphan']);
    expect(deleted.error).toBeNull();
    expect(deleted.source).not.toContain('- name: Orphan');

    const blocked = applyStateDeletions(yaml, 'yaml', ['Orphan', 'Finish']);
    expect(blocked.source).toBe(yaml);
    expect(blocked.error).toContain('Cannot delete “Finish”');
  });

  it('adds and removes a generic direct property without touching nested fields', () => {
    const added = applyStateField(
      advancedYaml,
      'yaml',
      0,
      'dataInput',
      '{"from":"request","keep":true}',
    );
    expect(added.error).toBeNull();
    expect(added.source).toContain('dataInput: {"from":"request","keep":true}');
    expect(added.source).toContain('stateDataFilter:');
    expect(stateFieldKeys(added.source, 'yaml', 0)).toContain('dataInput');

    const removed = applyStateField(added.source, 'yaml', 0, 'dataInput', '');
    expect(removed.error).toBeNull();
    expect(removed.source).not.toContain('dataInput:');
    expect(removed.source).toContain('x-custom: keep-me');
  });

  it('rejects unsafe generic property names', () => {
    const result = applyStateField(yaml, 'yaml', 0, 'bad: key', 'true');
    expect(result.source).toBe(yaml);
    expect(result.error).toContain('Property names must start');
  });
});
