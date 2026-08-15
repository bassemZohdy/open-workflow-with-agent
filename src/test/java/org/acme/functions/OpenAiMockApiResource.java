package org.acme.functions;

import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.Map;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

import io.quarkus.test.common.QuarkusTestResourceLifecycleManager;

/**
 * Mock OpenAI-compatible API server for testing OpenWorkflow agent sub-flows and tool executions.
 *
 * <p>Scenarios are driven by the first user message and the number of already-appended tool
 * messages ({@code role:"tool"}) in the request body:
 * <ul>
 *   <li>"time" - requests {@code get_current_time}, then answers.</li>
 *   <li>"multi" - a multi-step sequence: {@code calculate} -&gt; {@code get_current_time} -&gt; answer.</li>
 *   <li>"infinite" - always requests another {@code calculate} call, to exercise the iteration-limit guard.</li>
 *   <li>"error" - first requests a {@code calculate} of "1 / 0", which the utility catalog rejects
 *       with HTTP 400, exercising the workflow's tool-error handling; then answers.</li>
 *   <li>"direct" - answers immediately with no tool calls.</li>
 *   <li>default - requests {@code calculate "7 * 6"}, then answers.</li>
 * </ul>
 */
public class OpenAiMockApiResource implements QuarkusTestResourceLifecycleManager {
    private HttpServer server;
    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

    /** Captures the Authorization header of the most recent request, for auth regression tests. */
    static String lastAuthorizationHeader;

    @Override
    public Map<String, String> start() {
        try {
            server = HttpServer.create(new InetSocketAddress("localhost", 0), 0);
            server.createContext("/v1/chat/completions", this::chatCompletions);
            server.start();
            String base = "http://localhost:" + server.getAddress().getPort();
            return Map.of(
                    "quarkus.rest-client.openaiCatalog.url", base + "/v1",
                    // Local tool catalogs resolve to the application under test (Quarkus tests
                    // bind HTTP to port 8081 by default), which serves /functions/* locally.
                    "quarkus.rest-client.utilityCatalog.url", "http://localhost:8081",
                    "quarkus.rest-client.mcpCatalog.url", "http://localhost:8081"
            );
        } catch (IOException e) {
            throw new IllegalStateException("Cannot start OpenAI mock API server", e);
        }
    }

    private void chatCompletions(HttpExchange exchange) throws IOException {
        String requestBody = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
        lastAuthorizationHeader = exchange.getRequestHeaders().getFirst("Authorization");

        int toolMessages = countToolMessages(requestBody);
        String body;
        if (requestBody.contains("infinite")) {
            // Never terminates: always request another calculator call so the loop hits its
            // max_tool_iterations guard.
            body = toolCallBody("call-infinite-" + toolMessages, "calculate", "{\"expression\":\"1 + 1\"}");
        } else if (requestBody.contains("multi")) {
            // Multi-step sequence: calculate -> get_current_time -> final answer.
            if (toolMessages == 0) {
                body = toolCallBody("call-multi-1", "calculate", "{\"expression\":\"2 + 3\"}");
            } else if (toolMessages == 1) {
                body = toolCallBody("call-multi-2", "get_current_time", "{\"timezone\":\"UTC\"}");
            } else {
                body = finalBody("multi-step done");
            }
        } else if (requestBody.contains("error") && toolMessages == 0) {
            // First turn requests a tool call whose expression the utility catalog rejects (HTTP 400).
            body = toolCallBody("call-error-1", "calculate", "{\"expression\":\"1 / 0\"}");
        } else if (toolMessages > 0) {
            body = finalBody("42");
        } else if (requestBody.contains("time")) {
            body = toolCallBody("call-time-1", "get_current_time", "{\"timezone\":\"UTC\"}");
        } else if (requestBody.contains("direct")) {
            body = finalBody("Direct answer without tool calls");
        } else {
            body = toolCallBody("call-calc-1", "calculate", "{\"expression\":\"7 * 6\"}");
        }

        respond(exchange, 200, body);
    }

    private static int countToolMessages(String requestBody) {
        try {
            JsonNode root = OBJECT_MAPPER.readTree(requestBody);
            JsonNode messages = root.path("messages");
            if (!messages.isArray()) {
                return 0;
            }
            int count = 0;
            for (JsonNode message : messages) {
                if ("tool".equals(message.path("role").asText())) {
                    count++;
                }
            }
            return count;
        } catch (Exception e) {
            return 0;
        }
    }

    private static String toolCallBody(String id, String toolName, String arguments) {
        return "{\"id\":\"" + id + "\",\"object\":\"chat.completion\",\"choices\":[{\"index\":0,\"message\":{"
                + "\"role\":\"assistant\",\"content\":null,\"tool_calls\":[{\"id\":\"" + id
                + "\",\"type\":\"function\",\"function\":{\"name\":\"" + toolName
                + "\",\"arguments\":\"" + arguments.replace("\"", "\\\"") + "\"}}]},\"finish_reason\":\"tool_calls\"}]}";
    }

    private static String finalBody(String content) {
        return "{\"id\":\"mock-final\",\"object\":\"chat.completion\",\"choices\":[{\"index\":0,"
                + "\"message\":{\"role\":\"assistant\",\"content\":\"" + content + "\"},\"finish_reason\":\"stop\"}]}";
    }

    private static void respond(HttpExchange exchange, int status, String body) throws IOException {
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", "application/json");
        exchange.sendResponseHeaders(status, bytes.length);
        try (OutputStream output = exchange.getResponseBody()) {
            output.write(bytes);
        }
    }

    @Override
    public void stop() {
        if (server != null) {
            server.stop(0);
        }
    }
}
