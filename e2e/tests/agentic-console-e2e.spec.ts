import { test, expect } from '@playwright/test';

test.describe('Orchestrator OpenWorkflow Console & API E2E Verification', () => {
  test('loads console UI and verifies title and health status', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1')).toHaveText('Agentic OpenWorkflow Console');
    await expect(page.locator('#health')).toBeVisible();
  });

  test('executes the bundled mock agent synchronously', async ({ request }) => {
    const response = await request.post('/agent/sync', {
      data: { payload: { task: '25 * 4' } }
    });
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.agent).toBe('mock-rest-agent');
    expect(body.output).toContain('25 * 4');
  });

  test('rejects an invalid async agent request contract', async ({ request }) => {
    const response = await request.post('/agent/async', {
      data: { payload: { task: 'x' } } // missing callback_url / workflow_instance_id
    });
    expect(response.status()).toBe(400);
  });

  test('agent_call workflow completes in sync mode', async ({ request }) => {
    const response = await request.post('/agent_call', {
      data: {
        mode: 'sync',
        agent_request: { task: 'e2e sync check' }
      }
    });
    expect(response.status()).toBe(201);
    const body = await response.json();
    expect(body.workflowdata.agent_response.agent).toBe('mock-rest-agent');
    expect(body.workflowdata.agent_response.output).toContain('e2e sync check');
  });

  test('agent_call workflow accepts an async request and suspends', async ({ request }) => {
    // The start call returns while the instance is suspended in the callback state; the
    // response CloudEvent round-trip (suspend -> resume) is covered by the Maven suite.
    const response = await request.post('/agent_call', {
      data: {
        mode: 'async',
        agent_request: { task: 'e2e async check' },
        callback_url: 'http://localhost:8080/agent/response-event'
      }
    });
    expect(response.status()).toBe(201);
    const body = await response.json();
    expect(body.id).toBeTruthy();
    // While suspended the response either carries agent_response: null or omits the key.
    expect(body.workflowdata.agent_response ?? null).toBeNull();
  });

  test('agent_call workflow rejects an invalid mode', async ({ request }) => {
    const response = await request.post('/agent_call', {
      data: {
        mode: 'queued',
        agent_request: { task: 'x' }
      }
    });
    expect(response.status()).toBe(201);
    const body = await response.json();
    expect(body.workflowdata.error).toContain('mode');
  });
});
