package org.acme.functions;

import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

import jakarta.ws.rs.BadRequestException;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.core.MediaType;
import org.jboss.logging.Logger;

@Path("/functions")
@Produces(MediaType.APPLICATION_JSON)
public class UtilityResource {
    private static final Logger LOG = Logger.getLogger(UtilityResource.class);
    private final Map<String, String> memoryStore = new ConcurrentHashMap<>();
    private final Map<String, Map<String, Object>> hitlRequests = new ConcurrentHashMap<>();

    @GET
    @Path("/time")
    public Map<String, String> time(@QueryParam("timezone") String timezone) {
        if (timezone == null || timezone.isBlank()) {
            throw new BadRequestException("timezone is required");
        }
        try {
            ZoneId zone = ZoneId.of(timezone);
            LOG.infof("utility time executed timezone=%s", timezone);
            return Map.of("timezone", timezone, "datetime", ZonedDateTime.now(zone).toString());
        } catch (java.time.DateTimeException e) {
            throw new BadRequestException("invalid IANA timezone: " + timezone);
        }
    }

    @POST
    @Path("/calculator")
    @Consumes(MediaType.APPLICATION_JSON)
    public Map<String, Object> calculate(Map<String, String> request) {
        String expression = request == null ? null : request.get("expression");
        if (expression == null || expression.isBlank()) {
            throw new BadRequestException("expression is required");
        }
        try {
            double result = new ExpressionParser(expression).parse();
            LOG.infof("utility calculator executed expression=%s result=%s", expression, result);
            return Map.of("expression", expression, "result", result);
        } catch (RuntimeException e) {
            throw new BadRequestException("invalid arithmetic expression");
        }
    }

    // Model Context Protocol (MCP) Tool Endpoints
    @GET
    @Path("/mcp/tools")
    public Map<String, Object> listMcpTools() {
        LOG.info("MCP tools list requested");
        return Map.of(
            "protocol_version", "2024-11-05",
            "tools", List.of(
                Map.of("name", "web_search", "description", "Search the web for real-time information"),
                Map.of("name", "read_resource", "description", "Read an external URI resource or document"),
                Map.of("name", "database_query", "description", "Execute structured database query")
            )
        );
    }

    @POST
    @Path("/mcp/call")
    @Consumes(MediaType.APPLICATION_JSON)
    public Map<String, Object> callMcpTool(Map<String, Object> request) {
        if (request == null || !request.containsKey("name")) {
            throw new BadRequestException("name is required for MCP tool execution");
        }
        String toolName = String.valueOf(request.get("name"));
        Object arguments = request.getOrDefault("arguments", Map.of());
        LOG.infof("MCP tool call executed tool=%s arguments=%s", toolName, arguments);
        return Map.of(
            "name", toolName,
            "status", "success",
            "content", "Executed MCP tool " + toolName + " with arguments " + arguments
        );
    }

    // Agent-to-Agent (A2A) Delegation Endpoints
    @GET
    @Path("/a2a/agents")
    public Map<String, Object> listAgents() {
        LOG.info("A2A agent directory requested");
        return Map.of(
            "agents", List.of(
                Map.of("agent_id", "researcher_agent", "description", "Specialized sub-agent for deep web and code research"),
                Map.of("agent_id", "coder_agent", "description", "Specialized sub-agent for code generation and refactoring"),
                Map.of("agent_id", "reviewer_agent", "description", "Specialized sub-agent for code review and verification")
            )
        );
    }

    @POST
    @Path("/a2a/delegate")
    @Consumes(MediaType.APPLICATION_JSON)
    public Map<String, Object> delegateToAgent(Map<String, String> request) {
        if (request == null || !request.containsKey("target_agent") || !request.containsKey("prompt")) {
            throw new BadRequestException("target_agent and prompt are required for A2A delegation");
        }
        String targetAgent = request.get("target_agent");
        String prompt = request.get("prompt");
        LOG.infof("A2A delegation executed target_agent=%s prompt=%s", targetAgent, prompt);
        return Map.of(
            "target_agent", targetAgent,
            "status", "completed",
            "delegation_result", "Sub-agent " + targetAgent + " processed prompt: " + prompt
        );
    }

    // Short/Long-Term Memory Endpoints
    @GET
    @Path("/memory/get")
    public Map<String, String> getMemory(@QueryParam("key") String key) {
        if (key == null || key.isBlank()) {
            throw new BadRequestException("key is required for memory retrieval");
        }
        String value = memoryStore.getOrDefault(key, "");
        LOG.infof("Memory retrieve executed key=%s found=%s", key, !value.isEmpty());
        return Map.of("key", key, "value", value);
    }

    @POST
    @Path("/memory/set")
    @Consumes(MediaType.APPLICATION_JSON)
    public Map<String, String> setMemory(Map<String, String> request) {
        if (request == null || !request.containsKey("key") || !request.containsKey("value")) {
            throw new BadRequestException("key and value are required for memory storage");
        }
        String key = request.get("key");
        String value = request.get("value");
        memoryStore.put(key, value);
        LOG.infof("Memory set executed key=%s", key);
        return Map.of("key", key, "status", "stored");
    }

    @POST
    @Path("/memory/search")
    @Consumes(MediaType.APPLICATION_JSON)
    public Map<String, Object> searchMemory(Map<String, Object> request) {
        if (request == null || !request.containsKey("query")) {
            throw new BadRequestException("query is required for memory search");
        }
        String query = String.valueOf(request.get("query"));
        LOG.infof("Memory search executed query=%s", query);
        return Map.of(
            "query", query,
            "matches", List.of(
                Map.of("key", "context_summary", "score", 0.95, "value", "Relevant context for " + query)
            )
        );
    }

    // Human-in-the-Loop (HITL) Endpoints
    @POST
    @Path("/hitl/request")
    @Consumes(MediaType.APPLICATION_JSON)
    public Map<String, Object> requestApproval(Map<String, String> request) {
        if (request == null || !request.containsKey("action_name")) {
            throw new BadRequestException("action_name is required for HITL approval request");
        }
        String requestId = UUID.randomUUID().toString();
        String actionName = request.get("action_name");
        String description = request.getOrDefault("description", "Human approval required");

        Map<String, Object> approvalRecord = Map.of(
            "request_id", requestId,
            "action_name", actionName,
            "description", description,
            "status", "approved" // auto-approved in test mock environment
        );
        hitlRequests.put(requestId, approvalRecord);
        LOG.infof("HITL approval requested requestId=%s actionName=%s", requestId, actionName);
        return approvalRecord;
    }

    @POST
    @Path("/hitl/approve")
    @Consumes(MediaType.APPLICATION_JSON)
    public Map<String, Object> approveRequest(Map<String, Object> request) {
        if (request == null || !request.containsKey("request_id")) {
            throw new BadRequestException("request_id is required for HITL approval");
        }
        String requestId = String.valueOf(request.get("request_id"));
        boolean approved = Boolean.parseBoolean(String.valueOf(request.getOrDefault("approved", true)));
        String status = approved ? "approved" : "denied";

        LOG.infof("HITL decision recorded requestId=%s status=%s", requestId, status);
        return Map.of("request_id", requestId, "status", status);
    }

    @GET
    @Path("/hitl/status")
    public Map<String, Object> getApprovalStatus(@QueryParam("request_id") String requestId) {
        if (requestId == null || requestId.isBlank()) {
            throw new BadRequestException("request_id is required for HITL status check");
        }
        Map<String, Object> record = hitlRequests.getOrDefault(requestId, Map.of("request_id", requestId, "status", "pending"));
        LOG.infof("HITL status checked requestId=%s status=%s", requestId, record.get("status"));
        return record;
    }

    // Guardrails Output Validation Endpoint
    @POST
    @Path("/guardrails/validate")
    @Consumes(MediaType.APPLICATION_JSON)
    public Map<String, Object> validateOutput(Map<String, String> request) {
        if (request == null || !request.containsKey("content")) {
            throw new BadRequestException("content is required for guardrails validation");
        }
        String content = request.get("content");
        boolean valid = !content.contains("INVALID_SCHEMA") && !content.contains("FORBIDDEN");
        LOG.infof("Guardrails validate executed valid=%s", valid);
        return Map.of(
            "valid", valid,
            "content", content,
            "violations", valid ? List.of() : List.of("Guardrail validation rule failed")
        );
    }

    private static final class ExpressionParser {
        private final String input;
        private int position;

        ExpressionParser(String input) { this.input = input; }

        double parse() {
            double value = expression();
            skipWhitespace();
            if (position != input.length()) throw new IllegalArgumentException();
            return value;
        }

        private double expression() {
            double value = term();
            while (true) {
                skipWhitespace();
                if (match('+')) value += term();
                else if (match('-')) value -= term();
                else return value;
            }
        }

        private double term() {
            double value = factor();
            while (true) {
                skipWhitespace();
                if (match('*')) value *= factor();
                else if (match('/')) value /= factor();
                else return value;
            }
        }

        private double factor() {
            skipWhitespace();
            if (match('(')) {
                double value = expression();
                if (!match(')')) throw new IllegalArgumentException();
                return value;
            }
            int start = position;
            if (match('-')) return -factor();
            while (position < input.length() && (Character.isDigit(input.charAt(position)) || input.charAt(position) == '.')) position++;
            if (start == position) throw new IllegalArgumentException();
            return Double.parseDouble(input.substring(start, position));
        }

        private boolean match(char expected) {
            if (position < input.length() && input.charAt(position) == expected) { position++; return true; }
            return false;
        }

        private void skipWhitespace() { while (position < input.length() && Character.isWhitespace(input.charAt(position))) position++; }
    }
}
