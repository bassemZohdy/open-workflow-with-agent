package org.acme.functions;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.DELETE;
import jakarta.ws.rs.DefaultValue;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.HeaderParam;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.PUT;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.HttpHeaders;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

/** Read-only workspace inventory endpoint used by the first Studio explorer. */
@ApplicationScoped
@Path("/api/studio/v1/documents")
@Produces(MediaType.APPLICATION_JSON)
public class StudioWorkspaceResource {

    private final ObjectMapper json = new ObjectMapper();

    @Inject
    StudioDocumentService documents;

    @GET
    public Response list(
            @QueryParam("kind") String kind,
            @QueryParam("prefix") String prefix,
            @QueryParam("query") String query,
            @QueryParam("includeDiagnostics") @DefaultValue("false") boolean includeDiagnostics,
            @QueryParam("page") @DefaultValue("1") int page,
            @QueryParam("pageSize") @DefaultValue("50") int pageSize,
            @HeaderParam("X-Request-ID") String requestedRequestId) {
        String requestId = requestedRequestId == null || requestedRequestId.isBlank()
                ? UUID.randomUUID().toString() : requestedRequestId;
        return Response.ok(documents.list(kind, prefix, query, includeDiagnostics, page, pageSize))
                .header("X-Request-ID", requestId)
                .header("X-Studio-API-Version", "1")
                .build();
    }

    @POST
    @Consumes({MediaType.APPLICATION_JSON, "application/yaml", "text/yaml"})
    public Response create(String body, @Context HttpHeaders headers,
            @HeaderParam("X-Request-ID") String requestedRequestId,
            @HeaderParam("If-None-Match") String ifNoneMatch) {
        String requestId = requestId(requestedRequestId);
        try {
            JsonNode request = jsonRequest(body, headers);
            String kind = requiredText(request, "kind");
            String path = requiredText(request, "path");
            String format = optionalText(request, "format");
            String content = requiredText(request, "content");
            StudioDocumentService.Document created = documents.create(kind, path, format, content);
            Response response = Response.status(Response.Status.CREATED)
                    .entity(created).header("ETag", created.etag()).build();
            return withHeaders(response, requestId);
        } catch (StudioDocumentService.WorkspaceException exception) {
            return problem(exception, requestId);
        } catch (RuntimeException exception) {
            return problem(400, "STUDIO_INVALID_REQUEST", "The create request is invalid", Map.of(), requestId);
        }
    }

    @GET
    @Path("{kind}/{documentId}")
    public Response read(@PathParam("kind") String kind, @PathParam("documentId") String documentId,
            @HeaderParam("X-Request-ID") String requestedRequestId,
            @HeaderParam("Accept") String accept) {
        String requestId = requestId(requestedRequestId);
        return documents.read(kind, documentId)
                .map(document -> rawRequested(accept)
                        ? withHeaders(Response.ok(document.content()).type(rawType(accept)), requestId)
                        : withHeaders(Response.ok(document)
                        .header("ETag", document.etag())
                        .build(), requestId))
                .orElseGet(() -> problem(404, "STUDIO_DOCUMENT_NOT_FOUND", "Document not found", Map.of(), requestId));
    }

    @PUT
    @Path("{kind}/{documentId}")
    @Consumes({MediaType.APPLICATION_JSON, "application/yaml", "text/yaml"})
    public Response update(@PathParam("kind") String kind, @PathParam("documentId") String documentId,
            String body, @Context HttpHeaders headers, @HeaderParam("X-Request-ID") String requestedRequestId,
            @HeaderParam("If-Match") String ifMatch) {
        String requestId = requestId(requestedRequestId);
        try {
            JsonNode request = jsonRequest(body, headers);
            String content = jsonContentOrRaw(body, request, headers);
            String format = optionalText(request, "format");
            StudioDocumentService.Document document = documents.update(kind, documentId, format, content, ifMatch);
            return withHeaders(Response.ok(document).header("ETag", document.etag()).build(), requestId);
        } catch (StudioDocumentService.WorkspaceException exception) {
            return problem(exception, requestId);
        } catch (RuntimeException exception) {
            return problem(400, "STUDIO_INVALID_REQUEST", "The update request is invalid", Map.of(), requestId);
        }
    }

    @DELETE
    @Path("{kind}/{documentId}")
    public Response delete(@PathParam("kind") String kind, @PathParam("documentId") String documentId,
            @QueryParam("acceptDependencyImpact") @DefaultValue("false") boolean acceptDependencyImpact,
            @HeaderParam("X-Request-ID") String requestedRequestId, @HeaderParam("If-Match") String ifMatch) {
        String requestId = requestId(requestedRequestId);
        try {
            StudioDocumentService.TrashReceipt receipt = documents.delete(kind, documentId, ifMatch,
                    acceptDependencyImpact);
            return withHeaders(Response.status(Response.Status.ACCEPTED).entity(receipt).build(), requestId);
        } catch (StudioDocumentService.WorkspaceException exception) {
            return problem(exception, requestId);
        }
    }

    @POST
    @Path("{kind}/{documentId}/validate")
    @Consumes({MediaType.APPLICATION_JSON, "application/yaml", "text/yaml"})
    public Response validate(@PathParam("kind") String kind, @PathParam("documentId") String documentId,
            String body, @Context HttpHeaders headers, @HeaderParam("X-Request-ID") String requestedRequestId) {
        String requestId = requestId(requestedRequestId);
        try {
            JsonNode request = jsonRequest(body, headers);
            String draft = request == null ? (body == null || body.isBlank() ? null : body)
                    : optionalText(request, "content");
            String format = optionalText(request, "format");
            return withHeaders(Response.ok(documents.validate(kind, documentId, draft, format)).build(), requestId);
        } catch (StudioDocumentService.WorkspaceException exception) {
            return problem(exception, requestId);
        } catch (RuntimeException exception) {
            return problem(400, "STUDIO_INVALID_REQUEST", "The validation request is invalid", Map.of(), requestId);
        }
    }

    @POST
    @Path("validate")
    @Consumes(MediaType.APPLICATION_JSON)
    public Response validateScope(String body, @Context HttpHeaders headers,
            @HeaderParam("X-Request-ID") String requestedRequestId) {
        String requestId = requestId(requestedRequestId);
        try {
            JsonNode request = jsonRequest(body, headers);
            String scope = optionalText(request, "scope");
            String kind = optionalText(request, "kind");
            String documentId = optionalText(request, "documentId");
            String draft = optionalText(request, "content");
            String format = optionalText(request, "format");
            return withHeaders(Response.ok(documents.validateScope(scope, kind, documentId, draft, format)).build(),
                    requestId);
        } catch (StudioDocumentService.WorkspaceException exception) {
            return problem(exception, requestId);
        } catch (RuntimeException exception) {
            return problem(400, "STUDIO_INVALID_REQUEST", "The validation request is invalid", Map.of(), requestId);
        }
    }

    @POST
    @Path("{kind}/{documentId}/rename")
    @Consumes(MediaType.APPLICATION_JSON)
    public Response rename(@PathParam("kind") String kind, @PathParam("documentId") String documentId,
            String body, @Context HttpHeaders headers, @HeaderParam("X-Request-ID") String requestedRequestId,
            @HeaderParam("If-Match") String ifMatch) {
        String requestId = requestId(requestedRequestId);
        try {
            JsonNode request = jsonRequest(body, headers);
            StudioDocumentService.RenameResult result = documents.rename(kind, documentId,
                    requiredText(request, "path"), ifMatch);
            return withHeaders(Response.ok(result).header("ETag", result.document().etag()).build(), requestId);
        } catch (StudioDocumentService.WorkspaceException exception) {
            return problem(exception, requestId);
        } catch (RuntimeException exception) {
            return problem(400, "STUDIO_INVALID_REQUEST", "The rename request is invalid", Map.of(), requestId);
        }
    }


    private Response withHeaders(Response.ResponseBuilder builder, String requestId) {
        return builder.header("X-Request-ID", requestId).header("X-Studio-API-Version", "1").build();
    }

    private Response withHeaders(Response response, String requestId) {
        return Response.fromResponse(response).header("X-Request-ID", requestId)
                .header("X-Studio-API-Version", "1").build();
    }

    private Response problem(StudioDocumentService.WorkspaceException exception, String requestId) {
        return problem(exception.status(), exception.code(), exception.getMessage(), exception.details(), requestId);
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
        return withHeaders(Response.status(status).type("application/problem+json").entity(entity).build(), requestId);
    }

    private JsonNode jsonRequest(String body, HttpHeaders headers) {
        if (body == null || body.isBlank()) return null;
        String contentType = headers == null || headers.getMediaType() == null ? ""
                : headers.getMediaType().toString().toLowerCase();
        if (!contentType.contains("json")) return null;
        try {
            return json.readTree(body);
        } catch (JsonProcessingException exception) {
            throw new StudioDocumentService.WorkspaceException(400, "STUDIO_INVALID_JSON",
                    "The JSON request body is invalid", Map.of());
        }
    }

    private String jsonContentOrRaw(String body, JsonNode request, HttpHeaders headers) {
        if (request == null) return body;
        return requiredText(request, "content");
    }

    private static String requiredText(JsonNode node, String field) {
        String value = optionalText(node, field);
        if (value == null || value.isBlank()) {
            throw new StudioDocumentService.WorkspaceException(400, "STUDIO_FIELD_REQUIRED",
                    "The request field '" + field + "' is required", Map.of("field", field));
        }
        return value;
    }

    private static String optionalText(JsonNode node, String field) {
        if (node == null || !node.isObject() || !node.has(field) || !node.get(field).isValueNode()) return null;
        return node.get(field).asText();
    }

    private static String requestId(String requestedRequestId) {
        return requestedRequestId == null || requestedRequestId.isBlank()
                ? UUID.randomUUID().toString() : requestedRequestId;
    }

    private static boolean rawRequested(String accept) {
        return accept != null && (accept.contains("application/yaml") || accept.contains("text/yaml")
                || accept.contains("application/json;source=true"));
    }

    private static String rawType(String accept) {
        return accept != null && accept.contains("application/json;source=true")
                ? "application/json" : (accept != null && accept.contains("text/yaml") ? "text/yaml" : "application/yaml");
    }

}
