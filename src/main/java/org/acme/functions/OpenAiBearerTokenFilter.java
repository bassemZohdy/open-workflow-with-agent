package org.acme.functions;

import java.io.IOException;

import jakarta.ws.rs.client.ClientRequestContext;
import jakarta.ws.rs.client.ClientRequestFilter;
import jakarta.ws.rs.core.HttpHeaders;

import org.eclipse.microprofile.config.ConfigProvider;

/**
 * Adds {@code Authorization: Bearer <openai.api-key>} to every call the "openaiCatalog" REST
 * client makes. Registered explicitly via {@code quarkus.rest-client.openaiCatalog.providers} in
 * application.properties - deliberately NOT a {@code @Provider} CDI bean, since that would
 * register it globally on every REST client this app has (including its own local utility/mcp/
 * a2a/etc. catalogs), which would leak the upstream LLM provider's key to the wrong place.
 *
 * <p>This exists because quarkus-openapi-generator's own bearer-auth wiring matches the
 * OpenAPI operation's declared path (baked into the generated JAX-RS client's {@code @Path})
 * against the request's fully-resolved URI path. That match only succeeds when the configured
 * base URL contributes no path segment of its own - it silently never matches (and so never
 * applies the configured bearer-token) once the base URL includes something like a "/v1"
 * provider root, which is the common case. This filter is a small, always-correct substitute
 * that doesn't depend on that path-matching at all.
 */
public class OpenAiBearerTokenFilter implements ClientRequestFilter {
    @Override
    public void filter(ClientRequestContext requestContext) throws IOException {
        ConfigProvider.getConfig().getOptionalValue("openai.api-key", String.class)
            .filter(key -> !key.isBlank())
            .ifPresent(key -> requestContext.getHeaders().putSingle(HttpHeaders.AUTHORIZATION, "Bearer " + key));
    }
}
