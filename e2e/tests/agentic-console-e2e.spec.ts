import { test, expect } from '@playwright/test';

test.describe('Agentic OpenWorkflow Console & API E2E Verification', () => {
  test('loads console UI and verifies title and health status', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1')).toHaveText('Agentic OpenWorkflow Console');
    await expect(page.locator('#health')).toBeVisible();
  });

  test('executes MCP tool call endpoint', async ({ request }) => {
    const response = await request.post('/functions/mcp/call', {
      data: { name: 'web_search', arguments: { query: 'OpenWorkflow' } }
    });
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.name).toBe('web_search');
    expect(body.status).toBe('success');
  });

  test('executes A2A delegation endpoint', async ({ request }) => {
    const response = await request.post('/functions/a2a/delegate', {
      data: { target_agent: 'researcher_agent', prompt: 'Analyze architecture' }
    });
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.target_agent).toBe('researcher_agent');
    expect(body.status).toBe('completed');
  });

  test('executes Memory set and get endpoints', async ({ request }) => {
    const setRes = await request.post('/functions/memory/set', {
      data: { key: 'e2e_key', value: 'e2e_val' }
    });
    expect(setRes.status()).toBe(200);

    const getRes = await request.get('/functions/memory/get?key=e2e_key');
    expect(getRes.status()).toBe(200);
    const body = await getRes.json();
    expect(body.value).toBe('e2e_val');
  });

  test('executes HITL approval request endpoint', async ({ request }) => {
    const response = await request.post('/functions/hitl/request', {
      data: { action_name: 'deploy_prod', description: 'E2E approval test' }
    });
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.action_name).toBe('deploy_prod');
    expect(body.status).toBeDefined();
  });

  test('executes Output Guardrails validation endpoint', async ({ request }) => {
    const response = await request.post('/functions/guardrails/validate', {
      data: { content: '{"status":"ok", "message":"Passed"}' }
    });
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.valid).toBe(true);
  });

  test('executes Parallel Fan-Out agent directory endpoint', async ({ request }) => {
    const response = await request.get('/functions/a2a/agents');
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.agents.length).toBeGreaterThan(0);
  });

  test('executes Task Planning goal decomposition endpoint', async ({ request }) => {
    const response = await request.post('/functions/planner/decompose', {
      data: { goal: 'Build production OpenWorkflow microservice' }
    });
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.tasks.length).toBe(3);
  });

  test('executes Multi-Provider Fallback endpoint', async ({ request }) => {
    const response = await request.post('/functions/fallback/chatCompletions', {
      data: { primary_provider: 'openai', messages: [{ role: 'user', content: 'test prompt' }] }
    });
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.provider).toBe('openai');
  });

  test('executes Utility Calculator endpoint', async ({ request }) => {
    const response = await request.post('/functions/calculator', {
      data: { expression: '25 * 4' }
    });
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.result).toBe(100);
  });
});
