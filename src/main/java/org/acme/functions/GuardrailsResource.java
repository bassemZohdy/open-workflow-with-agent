package org.acme.functions;

import java.util.List;
import java.util.Map;

import jakarta.ws.rs.BadRequestException;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;
import org.jboss.logging.Logger;

/**
 * Local output-guardrails mock backing {@code guardrails-catalog.yaml}.
 *
 * <p>Consumes the advertised {@code expected_format} parameter: when it is {@code json}, content
 * must parse as valid JSON in addition to the keyword-based checks.
 */
@Path("/functions/guardrails")
@Produces(MediaType.APPLICATION_JSON)
public class GuardrailsResource {
    private static final Logger LOG = Logger.getLogger(GuardrailsResource.class);

    @POST
    @Path("/validate")
    @Consumes(MediaType.APPLICATION_JSON)
    public Map<String, Object> validateOutput(Map<String, String> request) {
        if (request == null || !request.containsKey("content")) {
            throw new BadRequestException("content is required for guardrails validation");
        }
        String content = request.get("content");
        String expectedFormat = request.getOrDefault("expected_format", "json");

        boolean valid = !content.contains("INVALID_SCHEMA") && !content.contains("FORBIDDEN");
        if (valid && "json".equalsIgnoreCase(expectedFormat)) {
            valid = isJson(content);
        }
        LOG.infof("Guardrails validate executed valid=%s", valid);
        return Map.of(
                "valid", valid,
                "content", content,
                "violations", valid ? List.of() : List.of("Guardrail validation rule failed"));
    }

    private static boolean isJson(String content) {
        try {
            new com.fasterxml.jackson.databind.ObjectMapper().readTree(content);
            return true;
        } catch (Exception e) {
            return false;
        }
    }
}
