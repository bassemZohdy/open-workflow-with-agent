export type ExecutionPresetId = 'llm_chat' | 'agent_sync' | 'agent_async';

export type ExecutionPreset = {
  id: ExecutionPresetId;
  label: string;
  endpoint: string;
  payload: Record<string, unknown>;
};

export const executionPresets: ExecutionPreset[] = [
  {
    id: 'llm_chat',
    label: 'LLM chat',
    endpoint: 'llm_chat',
    payload: {
      messages: [{ role: 'user', content: 'Say hello in one short sentence.' }],
      temperature: 0,
      max_tokens: 64,
    },
  },
  {
    id: 'agent_sync',
    label: 'Agent · synchronous',
    endpoint: 'agent_call',
    payload: { mode: 'sync', agent_request: { task: 'Summarize the weather on Mars.' } },
  },
  {
    id: 'agent_async',
    label: 'Agent · asynchronous callback',
    endpoint: 'agent_call',
    payload: {
      mode: 'async',
      agent_request: { task: 'Summarize the weather on Mars.' },
      callback_url: '',
    },
  },
];

export function presetForWorkflow(workflowId: string | null | undefined): ExecutionPreset[] {
  if (workflowId === 'llm_chat')
    return executionPresets.filter((preset) => preset.id === 'llm_chat');
  if (workflowId === 'agent_call')
    return executionPresets.filter((preset) => preset.id !== 'llm_chat');
  return [];
}

export function defaultExecutionPayload(preset: ExecutionPresetId): Record<string, unknown> {
  const selected = executionPresets.find((candidate) => candidate.id === preset);
  return structuredClone(selected?.payload ?? {});
}

export function validateExecutionPayload(preset: ExecutionPresetId, payload: unknown): string[] {
  if (!isRecord(payload)) return ['Request payload must be a JSON object.'];
  if (preset === 'llm_chat') return validateLlmPayload(payload);
  return validateAgentPayload(preset, payload);
}

export function normalizedCallbackUrl(origin: string): string {
  return `${origin.replace(/\/$/, '')}/agent/response-event`;
}

function validateLlmPayload(payload: Record<string, unknown>): string[] {
  const errors: string[] = [];
  const messages = payload.messages;
  if (!Array.isArray(messages) || messages.length < 1 || messages.length > 20) {
    errors.push('messages must contain between 1 and 20 entries.');
  } else {
    messages.forEach((message, index) => {
      if (!isRecord(message) || !['user', 'assistant'].includes(String(message.role))) {
        errors.push(`messages[${index}].role must be user or assistant.`);
      }
      if (typeof message?.content !== 'string' || message.content.length > 8192) {
        errors.push(`messages[${index}].content must be a string of at most 8192 characters.`);
      }
    });
  }
  if (
    payload.model !== undefined &&
    ![
      'default-model',
      'llama3.1',
      'llama3.2',
      'llama3.3',
      'gpt-4o',
      'gpt-4o-mini',
      'claude-3-5-sonnet',
      'claude-3-5-haiku',
    ].includes(String(payload.model))
  ) {
    errors.push('model is not in the workflow allowlist.');
  }
  return errors;
}

function validateAgentPayload(
  preset: ExecutionPresetId,
  payload: Record<string, unknown>,
): string[] {
  const errors: string[] = [];
  const mode = payload.mode ?? 'sync';
  if (
    (preset === 'agent_sync' && mode !== 'sync') ||
    (preset === 'agent_async' && mode !== 'async')
  ) {
    errors.push(`mode must be ${preset === 'agent_async' ? 'async' : 'sync'} for this preset.`);
  }
  if (!isRecord(payload.agent_request)) errors.push('agent_request must be a JSON object.');
  if (
    payload.callback_url !== undefined &&
    (typeof payload.callback_url !== 'string' || payload.callback_url.length > 2048)
  ) {
    errors.push('callback_url must be a string of at most 2048 characters.');
  }
  if (preset === 'agent_async' && typeof payload.callback_url !== 'string') {
    errors.push('callback_url is required for the asynchronous preset.');
  }
  return errors;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
