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

public class MockCatalogResource implements QuarkusTestResourceLifecycleManager {
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
                    "quarkus.rest-client.utilityCatalog.url", "http://localhost:8081");
        } catch (IOException e) {
            throw new IllegalStateException("Cannot start mock catalog", e);
        }
    }

    private void chatCompletions(HttpExchange exchange) throws IOException {
        int call = llmCalls.incrementAndGet();
        String body = call == 1
                ? "{\"id\":\"mock-1\",\"object\":\"chat.completion\",\"choices\":[{\"index\":0,\"message\":{\"role\":\"assistant\",\"content\":null,\"tool_calls\":[{\"id\":\"call-1\",\"type\":\"function\",\"function\":{\"name\":\"calculate\",\"arguments\":\"{\\\"expression\\\":\\\"7 * 6\\\"}\"}}]},\"finish_reason\":\"tool_calls\"}]}"
                : "{\"id\":\"mock-2\",\"object\":\"chat.completion\",\"choices\":[{\"index\":0,\"message\":{\"role\":\"assistant\",\"content\":\"42\"},\"finish_reason\":\"stop\"}]}";
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
