package org.acme.functions;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.net.InetSocketAddress;
import java.net.URI;
import java.util.Map;

import org.junit.jupiter.api.Test;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

import io.quarkus.test.junit.QuarkusTest;
import io.quarkus.test.junit.QuarkusTestProfile;
import io.quarkus.test.junit.TestProfile;

@QuarkusTest
@TestProfile(AgentCallbackTimeoutTest.ShortCallbackTimeout.class)
class AgentCallbackTimeoutTest {

    @jakarta.inject.Inject
    AgentResource agentResource;

    @Test
    void neverRespondingCallbackCompletesWithinRequestTimeout() throws Exception {
        HttpServer server = HttpServer.create(new InetSocketAddress("localhost", 0), 0);
        server.createContext("/hang", this::hang);
        server.start();
        try {
            long started = System.currentTimeMillis();
            int status = agentResource.dispatchCallback(
                    URI.create("http://localhost:" + server.getAddress().getPort() + "/hang"),
                    "timeout-test",
                    Map.of("task", "hang"))
                    .get(3, java.util.concurrent.TimeUnit.SECONDS);
            long elapsed = System.currentTimeMillis() - started;
            assertEquals(-1, status);
            assertTrue(elapsed < 2_500, "callback timeout took too long: " + elapsed + "ms");
        } finally {
            server.stop(0);
        }
    }

    private void hang(HttpExchange exchange) {
        try {
            exchange.getRequestBody().readAllBytes();
            Thread.sleep(3_000);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        } catch (java.io.IOException ignored) {
            // The client is expected to close the request when its timeout expires.
        } finally {
            exchange.close();
        }
    }

    public static final class ShortCallbackTimeout implements QuarkusTestProfile {
        @Override
        public Map<String, String> getConfigOverrides() {
            return Map.of(
                    "agent.callback.allowed-hosts", "localhost",
                    "agent.callback.connect-timeout", "1s",
                    "agent.callback.request-timeout", "250ms",
                    "agent.callback.attempts", "1",
                    "agent.callback.retry-delay", "1ms");
        }
    }
}
