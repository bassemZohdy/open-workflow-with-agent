package org.acme.functions;

import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.TimeUnit;

import jakarta.ws.rs.BadRequestException;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.WebApplicationException;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import org.jboss.logging.Logger;

/**
 * Local Human-in-the-Loop approval gate backing {@code hitl-catalog.yaml}.
 *
 * <p>State machine: {@code requestApproval} stores a request as {@code pending};
 * {@code approveRequest} transitions it to {@code approved} or {@code denied} (recording the
 * approver and decision time), returning 404 for unknown request ids; {@code getApprovalStatus}
 * reports the current record. The deny branch of {@code sub_flows/hitl-gate.sw.yaml} is
 * therefore reachable, unlike the original implementation which stored requests pre-approved
 * and never wrote decisions back.
 */
@Path("/functions/hitl")
@Produces(MediaType.APPLICATION_JSON)
public class HitlResource {
    private static final Logger LOG = Logger.getLogger(HitlResource.class);
    private static final int MAX_STORE_ENTRIES = 10_000;
    private static final long STORE_TTL_MILLIS = TimeUnit.HOURS.toMillis(1);

    private final BoundedCache<String, Map<String, Object>> hitlRequests =
            new BoundedCache<>(MAX_STORE_ENTRIES, STORE_TTL_MILLIS);

    @POST
    @Path("/request")
    @Consumes(MediaType.APPLICATION_JSON)
    public Map<String, Object> requestApproval(Map<String, String> request) {
        if (request == null || !request.containsKey("action_name")) {
            throw new BadRequestException("action_name is required for HITL approval request");
        }
        String requestId = UUID.randomUUID().toString();
        String actionName = request.get("action_name");
        String description = request.getOrDefault("description", "Human approval required");

        Map<String, Object> approvalRecord = new HashMap<>();
        approvalRecord.put("request_id", requestId);
        approvalRecord.put("action_name", actionName);
        approvalRecord.put("description", description);
        approvalRecord.put("status", "pending");
        approvalRecord.put("approved", false);
        approvalRecord.put("created_at", Instant.now().toString());
        hitlRequests.put(requestId, approvalRecord);
        LOG.infof("HITL approval requested requestId=%s actionName=%s", requestId, LogSanitizer.safe(actionName));
        return approvalRecord;
    }

    @POST
    @Path("/approve")
    @Consumes(MediaType.APPLICATION_JSON)
    public Map<String, Object> approveRequest(Map<String, Object> request) {
        if (request == null || !request.containsKey("request_id")) {
            throw new BadRequestException("request_id is required for HITL approval");
        }
        String requestId = String.valueOf(request.get("request_id"));
        Map<String, Object> record = hitlRequests.getOrDefault(requestId, null);
        if (record == null) {
            throw new WebApplicationException(Response.status(Response.Status.NOT_FOUND)
                    .type(MediaType.APPLICATION_JSON)
                    .entity(Map.of("error", "unknown request_id: " + requestId))
                    .build());
        }
        // Fail closed: a decision request without an explicit "approved" flag denies the action.
        boolean approved = Boolean.parseBoolean(String.valueOf(request.getOrDefault("approved", false)));
        String status = approved ? "approved" : "denied";
        String approver = String.valueOf(request.getOrDefault("approved_by", "unknown"));

        Map<String, Object> updated = new HashMap<>(record);
        updated.put("status", status);
        updated.put("approved", approved);
        updated.put("approved_by", approver);
        updated.put("decided_at", Instant.now().toString());
        hitlRequests.put(requestId, updated);
        LOG.infof("HITL decision recorded requestId=%s status=%s approver=%s", requestId, status, LogSanitizer.safe(approver));
        return updated;
    }

    @GET
    @Path("/status")
    public Map<String, Object> getApprovalStatus(@QueryParam("request_id") String requestId) {
        if (requestId == null || requestId.isBlank()) {
            throw new BadRequestException("request_id is required for HITL status check");
        }
        Map<String, Object> record = hitlRequests.getOrDefault(requestId, Map.of("request_id", requestId, "status", "pending"));
        LOG.infof("HITL status checked requestId=%s status=%s", requestId, record.get("status"));
        return record;
    }
}
