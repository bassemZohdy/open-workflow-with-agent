import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import {
  defaultExecutionPayload,
  executionPresets,
  normalizedCallbackUrl,
  presetForWorkflow,
  validateExecutionPayload,
  type ExecutionPresetId,
} from './execution';
import type { DocumentSummary } from './workspace';

type ExecutionRecord = {
  preset: ExecutionPresetId;
  endpoint: string;
  instanceId: string | null;
  status: 'idle' | 'validating' | 'running' | 'suspended' | 'completed' | 'failed' | 'timed-out';
  startedAt: string | null;
  endedAt: string | null;
  output: unknown;
  error: string | null;
  rawResponse: string;
};

const initialRecord: ExecutionRecord = {
  preset: 'llm_chat',
  endpoint: 'llm_chat',
  instanceId: null,
  status: 'idle',
  startedAt: null,
  endedAt: null,
  output: null,
  error: null,
  rawResponse: '',
};

export function ExecutionPanel({ document }: { document: DocumentSummary }): ReactNode {
  const presets = useMemo(() => presetForWorkflow(document.workflowId ?? document.id), [document]);
  const [preset, setPreset] = useState<ExecutionPresetId>(presets[0]?.id ?? 'llm_chat');
  const [rawMode, setRawMode] = useState(false);
  const [payload, setPayload] = useState<Record<string, unknown>>(() =>
    defaultExecutionPayload(presets[0]?.id ?? 'llm_chat'),
  );
  const [rawPayload, setRawPayload] = useState(() => JSON.stringify(payload, null, 2));
  const [message, setMessage] = useState('');
  const [record, setRecord] = useState<ExecutionRecord>({ ...initialRecord });
  const monitorAbort = useRef<AbortController | null>(null);

  useEffect(() => () => monitorAbort.current?.abort(), [document.id]);

  if (presets.length === 0) return null;

  const selectedPreset =
    executionPresets.find((candidate) => candidate.id === preset) ?? presets[0]!;

  const selectPreset = (nextPreset: ExecutionPresetId) => {
    const next = defaultExecutionPayload(nextPreset);
    if (nextPreset === 'agent_async' && typeof next.callback_url === 'string') {
      next.callback_url = normalizedCallbackUrl(window.location.origin);
    }
    setPreset(nextPreset);
    setPayload(next);
    setRawPayload(JSON.stringify(next, null, 2));
    setMessage('');
    setRecord({ ...initialRecord, preset: nextPreset, endpoint: 'agent_call' });
  };

  const execute = async () => {
    let requestPayload: unknown = payload;
    if (rawMode) {
      try {
        requestPayload = JSON.parse(rawPayload) as unknown;
      } catch (error) {
        setMessage(
          `Invalid JSON payload: ${error instanceof Error ? error.message : 'parse error'}`,
        );
        return;
      }
    }
    const errors = validateExecutionPayload(preset, requestPayload);
    if (errors.length > 0) {
      setMessage(errors.join(' '));
      setRecord((current) => ({ ...current, status: 'failed', error: errors.join(' ') }));
      return;
    }
    const startedAt = new Date().toISOString();
    monitorAbort.current?.abort();
    const controller = new AbortController();
    monitorAbort.current = controller;
    setMessage('');
    setRecord({
      preset,
      endpoint: selectedPreset.endpoint,
      instanceId: null,
      status: 'running',
      startedAt,
      endedAt: null,
      output: null,
      error: null,
      rawResponse: '',
    });
    try {
      const response = await fetch(`/${selectedPreset.endpoint}`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify(requestPayload),
        signal: controller.signal,
      });
      const rawResponse = await response.text();
      const parsed = parseResponse(rawResponse);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText || 'execution failed'}`);
      }
      const instanceId = recordId(parsed);
      setRecord((current) => ({
        ...current,
        instanceId,
        status: instanceId && preset === 'agent_async' ? 'suspended' : 'completed',
        endedAt: instanceId && preset === 'agent_async' ? null : new Date().toISOString(),
        output: parsed,
        rawResponse,
      }));
      if (instanceId && preset === 'agent_async') {
        await monitorInstance(selectedPreset.endpoint, instanceId, controller.signal, (next) =>
          setRecord((current) => ({ ...current, ...next })),
        );
      }
    } catch (error) {
      if (controller.signal.aborted) return;
      const detail = error instanceof Error ? error.message : 'Execution failed.';
      setMessage(detail);
      setRecord((current) => ({
        ...current,
        status: 'failed',
        endedAt: new Date().toISOString(),
        error: detail,
      }));
    }
  };

  const stopMonitoring = () => {
    monitorAbort.current?.abort();
    setMessage('Monitoring stopped; the workflow instance was not cancelled.');
    setRecord((current) => ({ ...current, status: 'timed-out' }));
  };

  const updateStructured = (key: string, value: unknown) => {
    const next = { ...payload, [key]: value };
    setPayload(next);
    setRawPayload(JSON.stringify(next, null, 2));
  };

  return (
    <section className="execution-panel" aria-labelledby="execution-title">
      <div className="execution-heading">
        <div>
          <p className="eyebrow">Bounded runner execution · same-origin only</p>
          <h2 id="execution-title">Execution and debugging</h2>
        </div>
        <span className={`badge badge-execution-${record.status}`}>{record.status}</span>
      </div>
      <p className="muted-copy">
        Uses the configured browser identity and never asks for, stores, or logs an API key. Input
        stays in this component until the request finishes; no URL or browser-storage persistence.
      </p>
      <div className="execution-grid">
        <div>
          <label className="settings-field">
            <span>Execution preset</span>
            <select
              value={preset}
              onChange={(event) => selectPreset(event.target.value as ExecutionPresetId)}
            >
              {presets.map((candidate) => (
                <option value={candidate.id} key={candidate.id}>
                  {candidate.label}
                </option>
              ))}
            </select>
          </label>
          {!rawMode && preset === 'llm_chat' && (
            <>
              <label className="settings-field">
                <span>Model (optional)</span>
                <input
                  value={String(payload.model ?? '')}
                  placeholder="default-model"
                  onChange={(event) => updateStructured('model', event.target.value || undefined)}
                />
              </label>
              <label className="settings-field">
                <span>User message</span>
                <textarea
                  value={String(
                    (Array.isArray(payload.messages) &&
                    payload.messages[0] &&
                    typeof payload.messages[0] === 'object'
                      ? (payload.messages[0] as Record<string, unknown>).content
                      : '') ?? '',
                  )}
                  onChange={(event) =>
                    updateStructured('messages', [{ role: 'user', content: event.target.value }])
                  }
                />
              </label>
            </>
          )}
          {!rawMode && (preset === 'agent_sync' || preset === 'agent_async') && (
            <>
              <label className="settings-field">
                <span>Agent task</span>
                <textarea
                  value={String(
                    (payload.agent_request as Record<string, unknown> | undefined)?.task ?? '',
                  )}
                  onChange={(event) =>
                    updateStructured('agent_request', { task: event.target.value })
                  }
                />
              </label>
              {preset === 'agent_async' && (
                <label className="settings-field">
                  <span>Callback correlation URL</span>
                  <input value={String(payload.callback_url ?? '')} readOnly />
                </label>
              )}
            </>
          )}
          <label className="settings-checkbox">
            <input
              type="checkbox"
              checked={rawMode}
              onChange={(event) => setRawMode(event.target.checked)}
            />
            <span>Use raw JSON mode</span>
          </label>
          {rawMode && (
            <label className="settings-field">
              <span>Request JSON</span>
              <textarea
                value={rawPayload}
                onChange={(event) => setRawPayload(event.target.value)}
              />
            </label>
          )}
          <div className="context-actions">
            <button
              className="button button-primary"
              type="button"
              onClick={() => void execute()}
              disabled={record.status === 'running' || record.status === 'suspended'}
            >
              Execute request
            </button>
            {record.status === 'suspended' && (
              <button className="button button-secondary" type="button" onClick={stopMonitoring}>
                Stop monitoring
              </button>
            )}
          </div>
          {message && (
            <p className="issue-resolution" role="alert">
              {message}
            </p>
          )}
        </div>
        <div className="execution-result" aria-live="polite">
          <dl className="metadata-grid">
            <div>
              <dt>Instance ID</dt>
              <dd>{record.instanceId ?? '—'}</dd>
            </div>
            <div>
              <dt>Started</dt>
              <dd>{record.startedAt ?? '—'}</dd>
            </div>
            <div>
              <dt>Ended</dt>
              <dd>{record.endedAt ?? '—'}</dd>
            </div>
          </dl>
          {record.error && <p className="issue-message">{record.error}</p>}
          <h3>Output</h3>
          <pre>
            {record.output === null ? 'No execution yet.' : JSON.stringify(record.output, null, 2)}
          </pre>
          <details>
            <summary>Raw response</summary>
            <pre>{record.rawResponse || 'No raw response.'}</pre>
          </details>
        </div>
      </div>
    </section>
  );
}

async function monitorInstance(
  endpoint: string,
  instanceId: string,
  signal: AbortSignal,
  update: (next: Partial<ExecutionRecord>) => void,
): Promise<void> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    await delay(500, signal);
    const response = await fetch(`/${endpoint}/${encodeURIComponent(instanceId)}`, {
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
      signal,
    });
    if (response.status === 404 || response.status === 410) {
      update({
        status: 'timed-out',
        endedAt: new Date().toISOString(),
        error: `Instance ${instanceId} is no longer available.`,
      });
      return;
    }
    if (!response.ok) throw new Error(`Monitoring HTTP ${response.status}.`);
    const rawResponse = await response.text();
    const parsed = parseResponse(rawResponse);
    const complete = Boolean(recordOutput(parsed));
    update({
      status: complete ? 'completed' : 'suspended',
      endedAt: complete ? new Date().toISOString() : null,
      output: parsed,
      rawResponse,
    });
    if (complete) return;
  }
  update({
    status: 'timed-out',
    endedAt: new Date().toISOString(),
    error: 'Monitoring reached the five-second limit; the workflow was not cancelled.',
  });
}

function delay(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(resolve, milliseconds);
    signal.addEventListener(
      'abort',
      () => {
        window.clearTimeout(timer);
        reject(new DOMException('Monitoring aborted', 'AbortError'));
      },
      { once: true },
    );
  });
}

function parseResponse(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

function recordId(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  return typeof record.id === 'string'
    ? record.id
    : typeof record.instanceId === 'string'
      ? record.instanceId
      : null;
}

function recordOutput(value: unknown): unknown {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const workflowdata = isRecord(record.workflowdata) ? record.workflowdata : null;
  return workflowdata?.agent_response ?? workflowdata?.llm_response ?? null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
