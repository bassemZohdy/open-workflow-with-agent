package org.acme.functions;

import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

import io.quarkus.test.common.QuarkusTestResourceLifecycleManager;

/**
 * Mock OpenAI-compatible API server for testing OpenWorkflow agent sub-flows and tool executions.
 * Supports calculator tool calls, time tool calls, and direct text completions.
 */
public class OpenAiMockApiResource implements QuarkusTestResourceLifecycleManager {
    private HttpServer server;
    private final AtomicInteger llmCalls = new AtomicInteger();

    @Override
    public Map<String, String> start() {
        try {
            server = HttpServer.create(new InetSocketAddress("localhost", 0), 0);
            server.createContext("/v1/chat/completions", this::chatCompletions);
            server.start();
            String base = "http://localhost:" + server.getAddress().getPort();
            return Map.of(
                    "quarkus.rest-client.openaiCatalog.url", base + "/v1",
                    "quarkus.openapi-generator.openaiCatalog.url", base + "/v1",
                    "org.kie.kogito.openapi.client.openaiCatalog.url", base + "/v1",
                    "quarkus.rest-client.openaiCatalog_json.url", base + "/v1",
                    "quarkus.rest-client.utilityCatalog.url", "http://localhost:8081",
                    "quarkus.openapi-generator.utilityCatalog.url", "http://localhost:8081",
                    "org.kie.kogito.openapi.client.utilityCatalog.url", "http://localhost:8081",
                    "quarkus.rest-client.utilityCatalog_json.url", "http://localhost:8081"
            );
        } catch (IOException e) {
            throw new IllegalStateException("Cannot start OpenAI mock API server", e);
        }
    }

    private void chatCompletions(HttpExchange exchange) throws IOException {
        String requestBody = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
        int call = llmCalls.incrementAndGet();

        String body;
        if (requestBody.contains("time") && !requestBody.contains("role\":\"tool")) {
            body = "{\"id\":\"mock-time\",\"object\":\"chat.completion\",\"choices\":[{\"index\":0,\"message\":{\"role\":\"assistant\",\"content\":null,\"tool_calls\":[{\"id\":\"call-time-1\",\"type\":\"function\",\"function\":{\"name\":\"get_current_time\",\"arguments\":\"{\\\"timezone\\\":\\\"UTC\\\"}\"}}]},\"finish_reason\":\"tool_calls\"}]}";
        } else if (requestBody.contains("direct")) {
            body = "{\"id\":\"mock-direct\",\"object\":\"chat.completion\",\"choices\":[{\"index\":0,\"message\":{\"role\":\"assistant\",\"content\":\"Direct answer without tool calls\"},\"finish_reason\":\"stop\"}]}";
        } else if (!requestBody.contains("role\":\"tool")) {
            body = "{\"id\":\"mock-calc\",\"object\":\"chat.completion\",\"choices\":[{\"index\":0,\"message\":{\"role\":\"assistant\",\"content\":null,\"tool_calls\":[{\"id\":\"call-calc-1\",\"type\":\"function\",\"function\":{\"name\":\"calculate\",\"arguments\":\"{\\\"expression\\\":\\\"7 * 6\\\"}\"}}]},\"finish_reason\":\"tool_calls\"}]}";
        } else {
            body = "{\"id\":\"mock-final\",\"object\":\"chat.completion\",\"choices\":[{\"index\":0,\"message\":{\"role\":\"assistant\",\"content\":\"42\"},\"finish_reason\":\"stop\"}]}";
        }

        respond(exchange, 200, body);
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
        if (server != null) server.stop(0);
    }
}
