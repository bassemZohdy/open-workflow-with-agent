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
    { name: '1. Autonomous Agent Loop', value: 'agent_loop', expectedEndpoint: 'llm_tool_agent' },
    { name: '2. Model Context Protocol (MCP)', value: 'mcp', expectedEndpoint: 'functions/mcp/call' },
    { name: '3. Agent-to-Agent (A2A)', value: 'a2a', expectedEndpoint: 'functions/a2a/delegate' },
    { name: '4. Short & Long-Term Memory', value: 'memory', expectedEndpoint: 'functions/memory/set' },
    { name: '5. Human-in-the-Loop (HITL)', value: 'hitl', expectedEndpoint: 'functions/hitl/request' },
    { name: '6. Output Guardrails', value: 'guardrails', expectedEndpoint: 'functions/guardrails/validate' },
    { name: '7. Parallel Multi-Agent Fan-Out', value: 'parallel', expectedEndpoint: 'functions/a2a/agents' },
    { name: '8. Self-Reflection Critique', value: 'reflection', expectedEndpoint: 'functions/guardrails/validate' },
    { name: '9. Task Planning Decomposition', value: 'planner', expectedEndpoint: 'functions/planner/decompose' },
    { name: '10. Sequential Chaining', value: 'chain', expectedEndpoint: 'functions/a2a/delegate' },
    { name: '11. Supervisor Router', value: 'supervisor', expectedEndpoint: 'functions/a2a/delegate' },
    { name: '12. Multi-Provider Fallback', value: 'fallback', expectedEndpoint: 'functions/fallback/chatCompletions' },
  ];

  for (const pattern of patterns) {
    test(`records and verifies pattern: ${pattern.name}`, async ({ page }) => {
      await page.selectOption('#featurePreset', pattern.value);
      await page.dispatchEvent('#featurePreset', 'change');
      await expect(page.locator('#endpoint')).toHaveValue(pattern.expectedEndpoint);

      await page.click('#invoke');

      // Wait until HTTP response content is displayed in pre element
      await page.waitForFunction(
        () => {
          const text = document.getElementById('output')?.textContent || '';
          return text.includes('HTTP ') || text.includes('Executed') || text.includes('agents');
        },
        { timeout: 15000 }
      );

      const outputText = await page.locator('#output').innerText();
      expect(outputText).not.toContain('Invalid JSON payload');
      expect(outputText).toMatch(/HTTP \d{3}/);
    });
  }
});
