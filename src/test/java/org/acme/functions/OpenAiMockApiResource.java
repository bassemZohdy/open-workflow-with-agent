package org.acme.functions;

import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.Map;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

import io.quarkus.test.common.QuarkusTestResourceLifecycleManager;

/**
 * Mock OpenAI-compatible API server for testing the {@code llm_chat} workflow (and the
 * decision sub-flows if exercised over HTTP).
 *
 * <p>Scenarios are driven by the request body:
 * <ul>
 *   <li>"provider-error" anywhere in the body - the mock answers HTTP 500, exercising the
 *       workflow's {@code onErrors} mapping to a structured error.</li>
 *   <li>decision prompts return deterministic yes/no/option values so the decision
 *       sub-flows can be exercised through their real workflow endpoints.</li>
 *   <li>default - a plain assistant completion with no tool calls.</li>
 * </ul>
 */
public class OpenAiMockApiResource implements QuarkusTestResourceLifecycleManager {
    private HttpServer server;

    /** Captures the Authorization header of the most recent request, for auth regression tests. */
    static String lastAuthorizationHeader;

    @Override
    public Map<String, String> start() {
        try {
            server = HttpServer.create(new InetSocketAddress("localhost", 0), 0);
            server.createContext("/v1/chat/completions", this::chatCompletions);
            server.start();
            String base = "http://localhost:" + server.getAddress().getPort();
            return Map.of("quarkus.rest-client.openaiCatalog.url", base + "/v1");
        } catch (IOException e) {
            throw new IllegalStateException("Cannot start OpenAI mock API server", e);
        }
    }

    private void chatCompletions(HttpExchange exchange) throws IOException {
        String requestBody = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
        lastAuthorizationHeader = exchange.getRequestHeaders().getFirst("Authorization");

        if (requestBody.contains("provider-error")) {
            respond(exchange, 500, "{\"error\":{\"message\":\"mock provider failure\",\"type\":\"server_error\"}}");
            return;
        }
        String answer = requestBody.contains("strict boolean decision service")
                ? (requestBody.contains("ambiguous-answer") ? "maybe"
                        : requestBody.contains("false-decision") ? "no" : "yes")
                : requestBody.contains("strict option-selection service")
                        ? (requestBody.contains("invalid-answer") ? "maybe" : "blue")
                        : "Mock answer from provider";
        respond(exchange, 200, "{\"id\":\"mock-final\",\"object\":\"chat.completion\",\"choices\":[{\"index\":0,"
                + "\"message\":{\"role\":\"assistant\",\"content\":\"" + answer
                + "\"},\"finish_reason\":\"stop\"}]}");
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
