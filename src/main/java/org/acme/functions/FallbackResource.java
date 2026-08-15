package org.acme.functions;

import java.util.List;
import java.util.Map;
import java.util.Set;

import jakarta.ws.rs.BadRequestException;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;
import org.jboss.logging.Logger;

/**
 * Local multi-provider fallback mock backing {@code fallback-catalog.yaml}.
 *
 * <p>Consumes the advertised {@code fallback_provider} parameter: providers in the known-healthy
 * set serve the request directly; the sentinel {@code unavailable} primary simulates an outage and
 * triggers failover to the fallback provider, which is then reported as the serving provider.
 */
@Path("/functions/fallback")
@Produces(MediaType.APPLICATION_JSON)
public class FallbackResource {
    private static final Logger LOG = Logger.getLogger(FallbackResource.class);

    /** Providers the mock treats as healthy. */
    private static final Set<String> KNOWN_HEALTHY_PROVIDERS = Set.of("openai", "anthropic", "ollama", "litellm", "azure");

    @POST
    @Path("/chatCompletions")
    @Consumes(MediaType.APPLICATION_JSON)
    public Map<String, Object> fallbackChatCompletions(Map<String, Object> request) {
        if (request == null || !request.containsKey("messages")) {
            throw new BadRequestException("messages array is required for fallback chat completion");
        }
        String primaryProvider = String.valueOf(request.getOrDefault("primary_provider", "openai"));
        String fallbackProvider = String.valueOf(request.getOrDefault("fallback_provider", "litellm"));

        String servingProvider;
        if (KNOWN_HEALTHY_PROVIDERS.contains(primaryProvider)) {
            servingProvider = primaryProvider;
        } else {
            // Simulated outage: primary is unknown/unavailable, fail over to the fallback.
            servingProvider = fallbackProvider;
        }
        LOG.infof("Fallback chat completion executed provider=%s fallback_provider=%s",
                LogSanitizer.safe(primaryProvider), LogSanitizer.safe(fallbackProvider));
        return Map.of(
                "provider", servingProvider,
                "fallback_provider", fallbackProvider,
                "choices", List.of(
                        Map.of("message", Map.of("role", "assistant", "content", "Fallback chat completion response"))));
    }
}
