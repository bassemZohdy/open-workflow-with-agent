package org.acme.functions;

import java.util.List;
import java.util.Map;

import jakarta.ws.rs.BadRequestException;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;
import org.jboss.logging.Logger;

/** Local A2A sub-agent directory and delegation mocks backing {@code a2a-catalog.yaml}. */
@Path("/functions/a2a")
@Produces(MediaType.APPLICATION_JSON)
public class A2aResource {
    private static final Logger LOG = Logger.getLogger(A2aResource.class);

    @GET
    @Path("/agents")
    public Map<String, Object> listAgents() {
        LOG.info("A2A agent directory requested");
        return Map.of(
                "agents", List.of(
                        Map.of("agent_id", "researcher_agent", "description", "Specialized sub-agent for deep web and code research"),
                        Map.of("agent_id", "coder_agent", "description", "Specialized sub-agent for code generation and refactoring"),
                        Map.of("agent_id", "reviewer_agent", "description", "Specialized sub-agent for code review and verification")));
    }

    @POST
    @Path("/delegate")
    @Consumes(MediaType.APPLICATION_JSON)
    public Map<String, Object> delegateToAgent(Map<String, String> request) {
        if (request == null || !request.containsKey("target_agent") || !request.containsKey("prompt")) {
            throw new BadRequestException("target_agent and prompt are required for A2A delegation");
        }
        String targetAgent = request.get("target_agent");
        String prompt = request.get("prompt");
        // Deliberately do NOT echo the prompt back into the delegation result: the result flows
        // straight into the LLM context (e.g. chain_agent feeds step N's output into step N+1's
        // prompt), and echoing untrusted prompt text verbatim would model exactly the indirect
        // prompt-injection the reference implementation demonstrates defending against.
        LOG.infof("A2A delegation executed target_agent=%s prompt=%s", LogSanitizer.safe(targetAgent), LogSanitizer.safe(prompt));
        return Map.of(
                "target_agent", targetAgent,
                "status", "completed",
                "delegation_result", "Sub-agent " + targetAgent + " completed the delegated task");
    }
}
