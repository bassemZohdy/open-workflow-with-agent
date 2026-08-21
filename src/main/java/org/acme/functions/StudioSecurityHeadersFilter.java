package org.acme.functions;

import jakarta.annotation.Priority;
import jakarta.ws.rs.Priorities;
import jakarta.ws.rs.container.ContainerRequestContext;
import jakarta.ws.rs.container.ContainerResponseContext;
import jakarta.ws.rs.container.ContainerResponseFilter;
import jakarta.ws.rs.ext.Provider;

/** Applies browser security headers to Studio assets, including Quarkus static-resource responses. */
@Provider
@Priority(Priorities.HEADER_DECORATOR)
public class StudioSecurityHeadersFilter implements ContainerResponseFilter {

    private static final String CONTENT_SECURITY_POLICY = String.join("; ",
            "default-src 'self'", "base-uri 'self'", "object-src 'none'", "frame-ancestors 'self'",
            "form-action 'self'", "script-src 'self'", "style-src 'self'", "img-src 'self' data:",
            "font-src 'self'", "connect-src 'self'");

    @Override
    public void filter(ContainerRequestContext requestContext, ContainerResponseContext responseContext) {
        String path = requestContext.getUriInfo().getPath();
        if (path.startsWith("/")) path = path.substring(1);
        if (!path.equals("studio") && !path.startsWith("studio/")) return;
        responseContext.getHeaders().putSingle("Content-Security-Policy", CONTENT_SECURITY_POLICY);
        responseContext.getHeaders().putSingle("X-Content-Type-Options", "nosniff");
        responseContext.getHeaders().putSingle("Referrer-Policy", "same-origin");
    }
}

