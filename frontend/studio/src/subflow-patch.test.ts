import { describe, expect, it } from 'vitest';

import { patchSubflowInvocation, subflowInvocations } from './subflow-patch';

describe('subflow invocation patches', () => {
  it('reads and patches nested JSON subflow actions without dropping filters', () => {
    const source = JSON.stringify({
      specVersion: '0.8',
      states: [
        {
          name: 'Run',
          type: 'operation',
          actions: [
            {
              name: 'Invoke',
              subFlowRef: 'old_subflow',
              version: '1.0',
              actionDataFilter: { useResults: false },
            },
          ],
        },
      ],
    });
    expect(subflowInvocations(source, 'json', 0)).toEqual([
      { index: 0, actionName: 'Invoke', reference: 'old_subflow', version: '1.0', line: null },
    ]);
    const result = patchSubflowInvocation(source, 'json', 0, 'boolean_decision', '1.1');
    expect(result.error).toBeNull();
    const parsed = JSON.parse(result.source) as {
      states: Array<{ actions: Array<Record<string, unknown>> }>;
    };
    expect(parsed.states[0]?.actions[0]?.subFlowRef).toBe('boolean_decision');
    expect(parsed.states[0]?.actions[0]?.version).toBe('1.1');
    expect(parsed.states[0]?.actions[0]?.actionDataFilter).toEqual({ useResults: false });
  });

  it('adds and edits YAML subflow actions while retaining neighboring state fields', () => {
    const source = `specVersion: '0.8'
states:
  - name: Run
    type: operation
    actions: []
    transition: End
  - name: End
    type: inject
    end: true
`;
    const added = patchSubflowInvocation(source, 'yaml', 0, 'boolean_decision', '1.0', 'Decide');
    expect(added.error).toBeNull();
    expect(added.source).toContain("subFlowRef: 'boolean_decision'");
    expect(added.source).toContain("version: '1.0'");
    expect(added.source).toContain('transition: End');
    expect(subflowInvocations(added.source, 'yaml', 0)).toEqual([
      {
        index: 0,
        actionName: 'Decide',
        reference: 'boolean_decision',
        version: '1.0',
        line: 7,
      },
    ]);
    const edited = patchSubflowInvocation(added.source, 'yaml', 0, 'choice_decision', '2.0');
    expect(edited.error).toBeNull();
    expect(edited.source).toContain("subFlowRef: 'choice_decision'");
    expect(edited.source).toContain("version: '2.0'");
    expect(edited.source).toContain('transition: End');
  });
});
