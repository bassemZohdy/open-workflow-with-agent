package org.acme.functions;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.Collections;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import jakarta.ws.rs.BadRequestException;

class UtilityResourceTest {
    private final UtilityResource resource = new UtilityResource();

    @Test
    void calculatesOperatorPrecedenceAndParentheses() {
        assertEquals(42.0, resource.calculate(Map.of("expression", "(7 + 5) * 3.5")).get("result"));
    }

    @Test
    void calculatesSubtractionAndDivision() {
        assertEquals(75.0, resource.calculate(Map.of("expression", "100 - 50 / 2")).get("result"));
    }

    @Test
    void calculatesMultiplicationAndAddition() {
        assertEquals(70.0, resource.calculate(Map.of("expression", "10 + 20 * 3")).get("result"));
    }

    @Test
    void calculatesNestedParentheses() {
        assertEquals(10.0, resource.calculate(Map.of("expression", "((10 + 5) * 2) / 3")).get("result"));
    }

    @Test
    void handlesWhitespaceInExpressions() {
        assertEquals(40.0, resource.calculate(Map.of("expression", "   15   +   25   ")).get("result"));
    }

    @Test
    void handlesNegativeNumbersAndDecimals() {
        assertEquals(-10.5, resource.calculate(Map.of("expression", "-15.5 + 5")).get("result"));
        assertEquals(10.0, resource.calculate(Map.of("expression", "-5 * -2")).get("result"));
    }

    @Test
    void rejectsNullOrBlankExpression() {
        assertThrows(BadRequestException.class, () -> resource.calculate(null));
        assertThrows(BadRequestException.class, () -> resource.calculate(Collections.emptyMap()));
        assertThrows(BadRequestException.class, () -> resource.calculate(Map.of("expression", "")));
        assertThrows(BadRequestException.class, () -> resource.calculate(Map.of("expression", "   ")));
    }

    @ParameterizedTest
    @ValueSource(strings = {"7 + nope", "(5 + 2", "5 ++ 2", "12 /", "abc", "((10 + 5)"})
    void rejectsInvalidExpressions(String expr) {
        assertThrows(BadRequestException.class, () -> resource.calculate(Map.of("expression", expr)));
    }

    @Test
    void returnsTimeForValidTimezone() {
        Map<String, String> result = resource.time("UTC");
        assertEquals("UTC", result.get("timezone"));
        assertNotNull(result.get("datetime"));
    }

    @ParameterizedTest
    @ValueSource(strings = {"Asia/Dubai", "America/New_York", "Europe/London", "GMT", "UTC+4", "UTC-5"})
    void returnsTimeForMultipleTimezones(String timezone) {
        Map<String, String> result = resource.time(timezone);
        assertEquals(timezone, result.get("timezone"));
        assertNotNull(result.get("datetime"));
    }

    @Test
    void rejectsNullOrBlankTimezone() {
        assertThrows(BadRequestException.class, () -> resource.time(null));
        assertThrows(BadRequestException.class, () -> resource.time(""));
        assertThrows(BadRequestException.class, () -> resource.time("   "));
    }

    @Test
    void rejectsInvalidTimezone() {
        assertThrows(BadRequestException.class, () -> resource.time("Not/A_Timezone"));
    }

    // MCP Tests
    @Test
    void listsMcpTools() {
        Map<String, Object> response = resource.listMcpTools();
        assertEquals("2024-11-05", response.get("protocol_version"));
        Object tools = response.get("tools");
        assertNotNull(tools);
        assertTrue(tools instanceof List);
    }

    @ParameterizedTest
    @ValueSource(strings = {"web_search", "read_resource", "database_query"})
    void executesMcpToolCall(String toolName) {
        Map<String, Object> response = resource.callMcpTool(Map.of("name", toolName, "arguments", Map.of("query", "OpenWorkflow")));
        assertEquals(toolName, response.get("name"));
        assertEquals("success", response.get("status"));
    }

    @Test
    void executesMcpToolCallWithoutArguments() {
        Map<String, Object> response = resource.callMcpTool(Map.of("name", "web_search"));
        assertEquals("web_search", response.get("name"));
        assertEquals("success", response.get("status"));
    }

    @Test
    void rejectsMcpToolCallWithoutName() {
        assertThrows(BadRequestException.class, () -> resource.callMcpTool(null));
        assertThrows(BadRequestException.class, () -> resource.callMcpTool(Collections.emptyMap()));
    }

    // A2A Tests
    @Test
    void listsA2aAgents() {
        Map<String, Object> response = resource.listAgents();
        Object agents = response.get("agents");
        assertNotNull(agents);
        assertTrue(agents instanceof List);
    }

    @ParameterizedTest
    @ValueSource(strings = {"researcher_agent", "coder_agent", "reviewer_agent"})
    void delegatesToA2aAgent(String agentId) {
        Map<String, Object> response = resource.delegateToAgent(Map.of("target_agent", agentId, "prompt", "Analyze architecture"));
        assertEquals(agentId, response.get("target_agent"));
        assertEquals("completed", response.get("status"));
    }

    @Test
    void rejectsA2aDelegationWithoutTargetOrPrompt() {
        assertThrows(BadRequestException.class, () -> resource.delegateToAgent(null));
        assertThrows(BadRequestException.class, () -> resource.delegateToAgent(Map.of("target_agent", "researcher_agent")));
        assertThrows(BadRequestException.class, () -> resource.delegateToAgent(Map.of("prompt", "Analyze repository")));
    }
}
