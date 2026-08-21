package org.acme.functions;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.DefaultValue;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.HeaderParam;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

/** Synchronization and recoverable-trash endpoints for guarded Studio mutations. */
@ApplicationScoped
@Path("/api/studio/v1")
@Produces(MediaType.APPLICATION_JSON)
public class StudioRecoveryResource {

    @Inject
    StudioDocumentService documents;

    @GET
    @Path("sync")
    public Response syncStatus(@HeaderParam("X-Request-ID") String requestedRequestId) {
        return headers(Response.ok(documents.syncStatus()).build(), requestId(requestedRequestId));
    }

    @POST
    @Path("sync")
    @Consumes(MediaType.APPLICATION_JSON)
    public Response requestSync(@HeaderParam("X-Request-ID") String requestedRequestId) {
        return headers(Response.status(Response.Status.ACCEPTED).entity(documents.syncStatus()).build(),
                requestId(requestedRequestId));
    }

    @POST
    @Path("trash/{trashId}/restore")
    public Response restore(@PathParam("trashId") String trashId,
            @HeaderParam("X-Request-ID") String requestedRequestId,
            @HeaderParam("If-None-Match") String ifNoneMatch) {
        String requestId = requestId(requestedRequestId);
        try {
            if (ifNoneMatch == null || ifNoneMatch.isBlank()) {
                throw new StudioDocumentService.WorkspaceException(428, "STUDIO_PRECONDITION_REQUIRED",
                        "If-None-Match is required to restore a trash entry", Map.of());
            }
            StudioDocumentService.Document document = documents.restore(trashId);
            return headers(Response.status(Response.Status.CREATED).entity(document)
                    .header("ETag", document.etag()).build(), requestId);
        } catch (StudioDocumentService.WorkspaceException exception) {
            return problem(exception, requestId);
        }
    }

    private static Response headers(Response response, String requestId) {
        return Response.fromResponse(response).header("X-Request-ID", requestId)
                .header("X-Studio-API-Version", "1").build();
    }

    private static Response problem(StudioDocumentService.WorkspaceException exception, String requestId) {
        Map<String, Object> entity = new LinkedHashMap<>();
        entity.put("type", "about:blank");
        entity.put("title", exception.code());
        entity.put("status", exception.status());
        entity.put("code", exception.code());
        entity.put("detail", exception.getMessage());
        entity.put("requestId", requestId);
        entity.putAll(exception.details());
        return headers(Response.status(exception.status()).type("application/problem+json")
                .entity(entity).build(), requestId);
    }

    private static String requestId(String requestedRequestId) {
        return requestedRequestId == null || requestedRequestId.isBlank()
                ? UUID.randomUUID().toString() : requestedRequestId;
    }
}
