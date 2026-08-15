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

/** Local planning & task-decomposition mock backing {@code planner-catalog.yaml}. */
@Path("/functions/planner")
@Produces(MediaType.APPLICATION_JSON)
public class PlannerResource {
    private static final Logger LOG = Logger.getLogger(PlannerResource.class);

    @POST
    @Path("/decompose")
    @Consumes(MediaType.APPLICATION_JSON)
    public Map<String, Object> decomposeGoal(Map<String, String> request) {
        if (request == null || !request.containsKey("goal")) {
            throw new BadRequestException("goal is required for task decomposition");
        }
        String goal = request.get("goal");
        LOG.infof("Planner decompose executed goal=%s", LogSanitizer.safe(goal));
        return Map.of(
                "goal", goal,
                "tasks", List.of(
                        Map.of("step", 1, "task", "Analyze goal requirements: " + goal),
                        Map.of("step", 2, "task", "Execute sub-tasks"),
                        Map.of("step", 3, "task", "Validate final output")));
    }
}
