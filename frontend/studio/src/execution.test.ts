import { describe, expect, it } from 'vitest';

import {
  defaultExecutionPayload,
  normalizedCallbackUrl,
  presetForWorkflow,
  validateExecutionPayload,
} from './execution';

describe('Studio execution presets', () => {
  it('exposes only the matching presets for supported workflow IDs', () => {
    expect(presetForWorkflow('llm_chat').map((preset) => preset.id)).toEqual(['llm_chat']);
    expect(presetForWorkflow('agent_call').map((preset) => preset.id)).toEqual([
      'agent_sync',
      'agent_async',
    ]);
    expect(presetForWorkflow('boolean_decision')).toEqual([]);
  });

  it('validates LLM and agent request contracts before network execution', () => {
    expect(validateExecutionPayload('llm_chat', defaultExecutionPayload('llm_chat'))).toEqual([]);
    expect(
      validateExecutionPayload('llm_chat', { messages: [{ role: 'system', content: 'x' }] }),
    ).toContain('messages[0].role must be user or assistant.');
    expect(validateExecutionPayload('agent_async', { mode: 'async', agent_request: {} })).toContain(
      'callback_url is required for the asynchronous preset.',
    );
    expect(
      validateExecutionPayload('agent_sync', { mode: 'sync', agent_request: { task: 'x' } }),
    ).toEqual([]);
  });

  it('builds callback URLs from the current origin without storing them', () => {
    expect(normalizedCallbackUrl('https://studio.example/')).toBe(
      'https://studio.example/agent/response-event',
    );
  });
});
