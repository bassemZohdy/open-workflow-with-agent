package org.acme.functions;

import java.io.IOException;

import jakarta.ws.rs.client.ClientRequestContext;
import jakarta.ws.rs.client.ClientRequestFilter;
import jakarta.ws.rs.core.HttpHeaders;

import org.eclipse.microprofile.config.ConfigProvider;

/**
 * Adds {@code Authorization: Bearer <agent.api-key>} to every call the "agentCatalog" REST
 * client makes, when a key is configured. Registered explicitly via
 * {@code quarkus.rest-client.agentCatalog.providers} in application.properties - deliberately
 * NOT a {@code @Provider} CDI bean, since that would register it globally on every REST
 * client this app has (including the OpenAI catalog), leaking the agent's credential to the
 * wrong place.
 *
 * <p>{@code agent.api-key} is optional: it defaults to the application's own
 * {@code utility.api-key} so that self-calls to the bundled mock agent pass the
 * {@link ApiKeyAuthFilter} gate in the %prod profile, and can be overridden with
 * {@code AGENT_API_KEY} when {@code AGENT_BASE_URL} points at an external agent with its
 * own credential. When blank (dev/test default) no header is sent at all.
 *
 * <p>Same rationale as {@link OpenAiBearerTokenFilter}: quarkus-openapi-generator's own
 * bearer-auth wiring silently fails to apply the token once the configured base URL
 * contributes a path segment, so this filter applies it unconditionally per-client instead.
 */
public class AgentBearerTokenFilter implements ClientRequestFilter {

    @Override
    public void filter(ClientRequestContext requestContext) throws IOException {
        var config = ConfigProvider.getConfig();
        String explicitKey = config.getOptionalValue("agent.api-key", String.class).orElse("");
        String key = explicitKey.isBlank() && isSameOrigin(requestContext.getUri(), configuredAgentUri(config))
                ? config.getOptionalValue("utility.api-key", String.class).orElse("")
                : explicitKey;
        if (!key.isBlank()) {
            requestContext.getHeaders().putSingle(HttpHeaders.AUTHORIZATION, "Bearer " + key);
        }
    }

    private static java.net.URI configuredAgentUri(org.eclipse.microprofile.config.Config config) {
        return config.getOptionalValue("quarkus.rest-client.agentCatalog.url", String.class)
                .map(java.net.URI::create)
                .orElse(null);
    }

    private static boolean isSameOrigin(java.net.URI target, java.net.URI configured) {
        if (target == null || configured == null || target.getHost() == null || configured.getHost() == null) {
            return false;
        }
        return target.getScheme().equalsIgnoreCase(configured.getScheme())
                && target.getHost().equalsIgnoreCase(configured.getHost())
                && effectivePort(target) == effectivePort(configured);
    }

    private static int effectivePort(java.net.URI uri) {
        if (uri.getPort() >= 0) {
            return uri.getPort();
        }
        return "https".equalsIgnoreCase(uri.getScheme()) ? 443 : 80;
    }
}
