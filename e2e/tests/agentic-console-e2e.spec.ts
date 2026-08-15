import { test, expect } from '@playwright/test';

test.describe('Agentic OpenWorkflow Console & API E2E Verification', () => {
  test('loads console UI and verifies title and health status', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1')).toHaveText('Agentic OpenWorkflow Console');
    await expect(page.locator('#health')).toBeVisible();
  });

  test('executes Utility Calculator endpoint', async ({ request }) => {
    const response = await request.post('/functions/calculator', {
      data: { expression: '25 * 4' }
    });
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.result).toBe(100);
  });

  test('executes Utility Time endpoint', async ({ request }) => {
    const response = await request.get('/functions/time?timezone=UTC');
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.timezone).toBe('UTC');
    expect(body.datetime).toBeDefined();
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

  test('lists MCP tools', async ({ request }) => {
    const response = await request.get('/functions/mcp/tools');
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.tools.length).toBeGreaterThan(0);
  });
});
