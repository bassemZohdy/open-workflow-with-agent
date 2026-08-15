package org.acme.functions;

import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;

import jakarta.annotation.Priority;
import jakarta.ws.rs.Priorities;
import jakarta.ws.rs.container.ContainerRequestContext;
import jakarta.ws.rs.container.ContainerRequestFilter;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.ext.Provider;

import org.eclipse.microprofile.config.inject.ConfigProperty;

/**
 * Caps total request throughput with a fixed 60s window when
 * {@code utility.rate-limit.requests-per-minute} (env var {@code UTILITY_RATE_LIMIT_REQUESTS_PER_MINUTE})
 * is set above zero. Left at the default of 0, rate limiting is disabled entirely so the demo
 * console, curl examples, and tests keep working unchanged.
 *
 * <p>This limits total application throughput rather than per-client throughput: the classic
 * RESTEasy stack used here doesn't expose the caller's remote address without an extra Undertow/
 * Vert.x dependency, and a global cap is still a meaningful backstop against a runaway loop or
 * accidental load hitting these otherwise-unauthenticated mock endpoints.
 */
@Provider
@Priority(Priorities.USER)
public class RateLimitFilter implements ContainerRequestFilter {

    private static final long WINDOW_MILLIS = 60_000;

    @ConfigProperty(name = "utility.rate-limit.requests-per-minute", defaultValue = "0")
    private int requestsPerMinute;

    private final AtomicReference<Window> window = new AtomicReference<>(new Window(currentWindowStart(), 0));

    @Override
    public void filter(ContainerRequestContext requestContext) {
        if (requestsPerMinute <= 0) {
            return;
        }
        String path = requestContext.getUriInfo().getPath();
        if (path.startsWith("q/")) {
            return;
        }

        long windowStart = currentWindowStart();
        Window observed;
        Window updated;
        do {
            observed = window.get();
            int count = observed.windowStart == windowStart ? observed.count + 1 : 1;
            updated = new Window(windowStart, count);
        } while (!window.compareAndSet(observed, updated));

        if (updated.count > requestsPerMinute) {
            requestContext.abortWith(Response.status(429)
                .type(MediaType.APPLICATION_JSON)
                .entity(Map.of("error", "rate limit exceeded, retry after the current window"))
                .build());
        }
    }

    private static long currentWindowStart() {
        long now = System.currentTimeMillis();
        return now - (now % WINDOW_MILLIS);
    }

    private static final class Window {
        final long windowStart;
        final int count;
        Window(long windowStart, int count) { this.windowStart = windowStart; this.count = count; }
    }
}
