import { test, expect } from '@playwright/test';

test.describe('Agentic OpenWorkflow Console E2E Recording & Verification', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('loads console UI and verifies title and health status', async ({ page }) => {
    await expect(page.locator('h1')).toHaveText('Agentic OpenWorkflow Console');
    await expect(page.locator('#health')).toBeVisible();
  });

  const patterns = [
    { name: '1. Model Context Protocol (MCP)', endpoint: 'functions/mcp/call', payload: { name: 'web_search', arguments: { query: 'OpenWorkflow' } } },
    { name: '2. Agent-to-Agent (A2A)', endpoint: 'functions/a2a/delegate', payload: { target_agent: 'researcher_agent', prompt: 'Analyze repo' } },
    { name: '3. Short & Long-Term Memory', endpoint: 'functions/memory/set', payload: { key: 'test_key', value: 'test_val' } },
    { name: '4. Human-in-the-Loop (HITL)', endpoint: 'functions/hitl/request', payload: { action_name: 'deploy', description: 'Approval test' } },
    { name: '5. Output Guardrails', endpoint: 'functions/guardrails/validate', payload: { content: '{"status":"ok"}' } },
    { name: '6. Parallel Multi-Agent Fan-Out', endpoint: 'functions/a2a/agents', payload: {} },
    { name: '7. Self-Reflection Critique', endpoint: 'functions/guardrails/validate', payload: { content: 'Critique content' } },
    { name: '8. Task Planning Decomposition', endpoint: 'functions/planner/decompose', payload: { goal: 'Build microservice' } },
    { name: '9. Sequential Chaining', endpoint: 'functions/a2a/delegate', payload: { target_agent: 'coder_agent', prompt: 'Write code' } },
    { name: '10. Supervisor Router', endpoint: 'functions/a2a/delegate', payload: { target_agent: 'reviewer_agent', prompt: 'Review code' } },
    { name: '11. Multi-Provider Fallback', endpoint: 'functions/fallback/chatCompletions', payload: { primary_provider: 'openai' } },
    { name: '12. Utility Calculator', endpoint: 'functions/calculator', payload: { expression: '25 * 4' } },
  ];

  for (const pattern of patterns) {
    test(`records and verifies pattern: ${pattern.name}`, async ({ page }) => {
      await page.fill('#endpoint', pattern.endpoint);
      await page.fill('#payload', JSON.stringify(pattern.payload, null, 2));

      await page.click('#invoke');

      await page.waitForFunction(
        () => {
          const text = document.getElementById('output')?.textContent || '';
          return text.includes('HTTP 200');
        },
        { timeout: 5000 }
      );

      const outputText = await page.locator('#output').innerText();
      expect(outputText).toContain('HTTP 200');
      expect(outputText).not.toContain('Invalid JSON payload');
    });
  }
});
