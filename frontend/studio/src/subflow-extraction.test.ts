import { describe, expect, it } from 'vitest';

import { extractSubflowStateRange } from './subflow-extraction';

const yaml = `id: order
version: '1.0'
specVersion: '0.8'
start: Start
states:
  - name: Start
    type: inject
    data:
      request: true
    transition: Call
  - name: Call
    type: operation
    actions:
      - name: Invoke
        functionRef:
          refName: orders.create
    transition: Finish
  - name: Finish
    type: inject
    end: true
`;

describe('subflow extraction', () => {
  it('extracts a connected linear YAML range and replaces it with an invocation', () => {
    const result = extractSubflowStateRange({
      source: yaml,
      format: 'yaml',
      stateNames: ['Start', 'Call'],
      subflowId: 'order-subflow',
      subflowName: 'Order preparation',
    });

    expect(result.error).toBeNull();
    expect(result.workflowSource).toContain("subFlowRef: 'order-subflow'");
    expect(result.workflowSource).toContain("transition: 'Finish'");
    expect(result.workflowSource).not.toContain('- name: Call');
    expect(result.subflowSource).toContain("start: 'Start'");
    expect(result.subflowSource).toContain('functionRef:');
    expect(result.dependencies.functionReferences).toContain('orders.create');
    expect(result.selectedStates).toEqual(['Start', 'Call']);
    expect(result.exitState).toBe('Finish');
  });

  it('rejects branching or data-filtered ranges without returning writes', () => {
    const source = yaml.replace(
      '    transition: Finish',
      '    stateDataFilter:\n      output: .result\n    transition: Finish',
    );
    const result = extractSubflowStateRange({
      source,
      format: 'yaml',
      stateNames: ['Start', 'Call'],
      subflowId: 'unsafe',
      subflowName: 'Unsafe',
    });

    expect(result.workflowSource).toBe(source);
    expect(result.subflowSource).toBe('');
    expect(result.error).toContain('data filters');
  });

  it('extracts JSON state objects while retaining unknown caller fields', () => {
    const source = JSON.stringify({
      id: 'demo',
      start: 'A',
      custom: { keep: true },
      states: [
        { name: 'A', type: 'inject', transition: 'B' },
        { name: 'B', type: 'sleep', end: true },
      ],
    });
    const result = extractSubflowStateRange({
      source,
      format: 'json',
      stateNames: ['A', 'B'],
      subflowId: 'demo-subflow',
      subflowName: 'Demo',
    });

    expect(result.error).toBeNull();
    expect(JSON.parse(result.workflowSource)).toMatchObject({
      custom: { keep: true },
      states: [
        {
          type: 'operation',
          actions: [{ subFlowRef: 'demo-subflow', version: '1.0' }],
          end: true,
        },
      ],
    });
    expect(JSON.parse(result.subflowSource).states).toHaveLength(2);
  });

  it('rejects a non-contiguous or disconnected selection', () => {
    const result = extractSubflowStateRange({
      source: yaml,
      format: 'yaml',
      stateNames: ['Start', 'Finish'],
      subflowId: 'disconnected',
      subflowName: 'Disconnected',
    });
    expect(result.workflowSource).toBe(yaml);
    expect(result.error).toContain('contiguous');
  });
});
