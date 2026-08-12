package org.acme.functions;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Map;
import java.util.Optional;

import jakarta.annotation.Priority;
import jakarta.ws.rs.Priorities;
import jakarta.ws.rs.container.ContainerRequestContext;
import jakarta.ws.rs.container.ContainerRequestFilter;
import jakarta.ws.rs.core.HttpHeaders;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.ext.Provider;

import org.eclipse.microprofile.config.inject.ConfigProperty;

/**
 * Gates every JAX-RS request behind a bearer API key when {@code utility.api-key}
 * (env var {@code UTILITY_API_KEY}) is configured. Left unset, auth is skipped entirely
 * so the demo console, curl examples, and tests keep working unchanged - set it before
 * exposing this service beyond localhost.
 */
@Provider
@Priority(Priorities.AUTHENTICATION)
public class ApiKeyAuthFilter implements ContainerRequestFilter {

    @ConfigProperty(name = "utility.api-key")
    Optional<String> configuredApiKey;

    @Override
    public void filter(ContainerRequestContext requestContext) throws IOException {
        if (configuredApiKey.isEmpty() || configuredApiKey.get().isBlank()) {
            return;
        }
        String path = requestContext.getUriInfo().getPath();
        if (path.startsWith("q/")) {
            return;
        }
        String authHeader = requestContext.getHeaderString(HttpHeaders.AUTHORIZATION);
        String expected = "Bearer " + configuredApiKey.get();
        if (authHeader == null || !constantTimeEquals(authHeader, expected)) {
            requestContext.abortWith(Response.status(Response.Status.UNAUTHORIZED)
                .type(MediaType.APPLICATION_JSON)
                .entity(Map.of("error", "missing or invalid API key"))
                .build());
        }
    }

    private static boolean constantTimeEquals(String a, String b) {
        return MessageDigest.isEqual(a.getBytes(StandardCharsets.UTF_8), b.getBytes(StandardCharsets.UTF_8));
    }
}
