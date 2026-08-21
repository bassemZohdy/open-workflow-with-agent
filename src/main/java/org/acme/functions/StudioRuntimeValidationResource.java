package org.acme.functions;

import jakarta.inject.Inject;
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

/** Guarded, parser-only SonataFlow validation boundary for saved workflow documents. */
@Path("/api/studio/v1/runtime-validation")
@Produces(MediaType.APPLICATION_JSON)
public class StudioRuntimeValidationResource {

    @Inject
    StudioRuntimeValidationService runtimeValidation;

    @POST
    @Path("{kind}/{documentId}")
    public Response runtimeValidate(@PathParam("kind") String kind, @PathParam("documentId") String documentId,
            @HeaderParam("X-Request-ID") String requestedRequestId) {
        String requestId = requestedRequestId == null || requestedRequestId.isBlank()
                ? UUID.randomUUID().toString() : requestedRequestId;
        try {
            return withHeaders(Response.ok(runtimeValidation.validateSaved(kind, documentId)), requestId);
        } catch (StudioDocumentService.WorkspaceException exception) {
            return problem(exception.status(), exception.code(), exception.getMessage(), exception.details(), requestId);
        }
    }

    private Response withHeaders(Response.ResponseBuilder builder, String requestId) {
        return builder.header("X-Request-ID", requestId).header("X-Studio-API-Version", "1").build();
    }

    private Response problem(int status, String code, String detail, Map<String, ?> details, String requestId) {
        Map<String, Object> entity = new LinkedHashMap<>();
        entity.put("type", "about:blank");
        entity.put("title", code);
        entity.put("status", status);
        entity.put("code", code);
        entity.put("detail", detail);
        entity.put("requestId", requestId);
        entity.putAll(details);
        return withHeaders(Response.status(status).type("application/problem+json").entity(entity), requestId);
    }
}
