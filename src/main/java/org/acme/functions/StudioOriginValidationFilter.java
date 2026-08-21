package org.acme.functions;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.Arrays;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

import jakarta.annotation.Priority;
import jakarta.ws.rs.Priorities;
import jakarta.ws.rs.container.ContainerRequestContext;
import jakarta.ws.rs.container.ContainerRequestFilter;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.ext.Provider;

import org.eclipse.microprofile.config.inject.ConfigProperty;

/**
 * Rejects cross-origin browser mutations to the Studio workspace API.
 *
 * <p>Requests without Origin/Referer are retained for non-browser API clients, where the
 * bearer-key filter is the CSRF boundary. Browser requests must be same-origin or use an
 * explicitly configured origin allowlist.
 */
@Provider
@Priority(Priorities.AUTHORIZATION)
public class StudioOriginValidationFilter implements ContainerRequestFilter {

    @ConfigProperty(name = "studio.allowed-origins", defaultValue = "")
    Optional<String> configuredOrigins;

    @Override
    public void filter(ContainerRequestContext requestContext) {
        if (!isStudioMutation(requestContext)) return;

        String origin = requestContext.getHeaderString("Origin");
        String referer = requestContext.getHeaderString("Referer");
        if ((origin == null || origin.isBlank()) && (referer == null || referer.isBlank())) return;

        String suppliedOrigin = origin == null || origin.isBlank() ? originFrom(referer) : normalize(origin);
        Set<String> allowed = Arrays.stream(configuredOrigins.orElse("").split(","))
                .map(StudioOriginValidationFilter::normalize)
                .filter(value -> !value.isBlank())
                .collect(Collectors.toSet());
        String requestOrigin = originFrom(requestContext.getUriInfo().getRequestUri().toString());
        if (suppliedOrigin == null || suppliedOrigin.isBlank()
                || (!suppliedOrigin.equals(requestOrigin) && !allowed.contains(suppliedOrigin))) {
            requestContext.abortWith(Response.status(Response.Status.FORBIDDEN)
                    .type(MediaType.APPLICATION_JSON)
                    .entity(java.util.Map.of(
                            "code", "STUDIO_ORIGIN_FORBIDDEN",
                            "error", "The Studio mutation origin is not allowed"))
                    .build());
        }
    }

    private static boolean isStudioMutation(ContainerRequestContext requestContext) {
        String path = requestContext.getUriInfo().getPath();
        if (path.startsWith("/")) path = path.substring(1);
        if (!path.startsWith("api/studio/v1/")) return false;
        String method = requestContext.getMethod();
        if ("PUT".equals(method) || "DELETE".equals(method)) return true;
        return "POST".equals(method) && !path.endsWith("/validate");
    }

    private static String originFrom(String value) {
        if (value == null || value.isBlank()) return null;
        try {
            URI uri = new URI(value);
            if (uri.getScheme() == null || uri.getRawAuthority() == null) return null;
            return normalize(uri.getScheme() + "://" + uri.getRawAuthority());
        } catch (URISyntaxException exception) {
            return null;
        }
    }

    private static String normalize(String value) {
        if (value == null) return "";
        String normalized = value.trim();
        while (normalized.endsWith("/")) normalized = normalized.substring(0, normalized.length() - 1);
        return normalized;
    }
}
