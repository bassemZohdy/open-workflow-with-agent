package org.acme.functions;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.concurrent.atomic.AtomicReference;

import jakarta.enterprise.context.ApplicationScoped;

import org.eclipse.microprofile.config.inject.ConfigProperty;

import io.quarkus.vertx.web.RouteFilter;
import io.vertx.ext.web.RoutingContext;

/**
 * Protects the quarkus-http Reactive Messaging ingress used by SonataFlow callback
 * states. That ingress is not a Jakarta REST resource, so ContainerRequestFilter-based
 * authentication and rate limiting do not see it.
 */
@ApplicationScoped
public class CloudEventHttpSecurityFilter {

    private static final String CALLBACK_PATH = "/agent/response-event";
    private static final long WINDOW_MILLIS = 60_000L;

    @ConfigProperty(name = "utility.api-key", defaultValue = "")
    String configuredApiKey;

    @ConfigProperty(name = "utility.rate-limit.requests-per-minute", defaultValue = "0")
    int requestsPerMinute;

    private final AtomicReference<Window> window = new AtomicReference<>(new Window(windowStart(), 0));

    @RouteFilter(1_000)
    void filter(RoutingContext context) {
        if (!CALLBACK_PATH.equals(context.request().path())) {
            context.next();
            return;
        }

        if (configuredApiKey != null && !configuredApiKey.isBlank()) {
            String expected = "Bearer " + configuredApiKey;
            String supplied = context.request().getHeader("Authorization");
            if (supplied == null || !constantTimeEquals(supplied, expected)) {
                reject(context, 401, "missing or invalid API key");
                return;
            }
        }

        if (requestsPerMinute > 0 && !allowRequest()) {
            reject(context, 429, "rate limit exceeded, retry after the current window");
            return;
        }
        context.next();
    }

    private boolean allowRequest() {
        long currentWindow = windowStart();
        Window observed;
        Window updated;
        do {
            observed = window.get();
            int count = observed.windowStart == currentWindow ? observed.count + 1 : 1;
            updated = new Window(currentWindow, count);
        } while (!window.compareAndSet(observed, updated));
        return updated.count <= requestsPerMinute;
    }

    private static void reject(RoutingContext context, int status, String message) {
        context.response()
                .setStatusCode(status)
                .putHeader("Content-Type", "application/json")
                .end(toJson(message));
    }

    private static String toJson(String message) {
        return "{\"error\":\"" + message + "\"}";
    }

    private static boolean constantTimeEquals(String actual, String expected) {
        return MessageDigest.isEqual(
                actual.getBytes(StandardCharsets.UTF_8), expected.getBytes(StandardCharsets.UTF_8));
    }

    private static long windowStart() {
        long now = System.currentTimeMillis();
        return now - (now % WINDOW_MILLIS);
    }

    private record Window(long windowStart, int count) {
    }
}
