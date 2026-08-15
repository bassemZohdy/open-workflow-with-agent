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

/** Local MCP tool-discovery and execution mocks backing {@code mcp-catalog.yaml}. */
@Path("/functions/mcp")
@Produces(MediaType.APPLICATION_JSON)
public class McpResource {
    private static final Logger LOG = Logger.getLogger(McpResource.class);

    @GET
    @Path("/tools")
    public Map<String, Object> listMcpTools() {
        LOG.info("MCP tools list requested");
        return Map.of(
                "protocol_version", "2024-11-05",
                "tools", List.of(
                        Map.of("name", "web_search", "description", "Search the web for real-time information"),
                        Map.of("name", "read_resource", "description", "Read an external URI resource or document"),
                        Map.of("name", "database_query", "description", "Execute structured database query")));
    }

    @POST
    @Path("/call")
    @Consumes(MediaType.APPLICATION_JSON)
    public Map<String, Object> callMcpTool(Map<String, Object> request) {
        if (request == null || !request.containsKey("name")) {
            throw new BadRequestException("name is required for MCP tool execution");
        }
        String toolName = String.valueOf(request.get("name"));
        // Deliberately do NOT echo the raw arguments back into the returned content: the result
        // flows straight into the LLM context as a tool result, and echoing untrusted caller
        // arguments verbatim would model exactly the indirect prompt-injection the reference
        // implementation demonstrates defending against (OWASP LLM01 / ASI06).
        LOG.infof("MCP tool call executed tool=%s", LogSanitizer.safe(toolName));
        return Map.of(
                "name", toolName,
                "status", "success",
                "content", "Executed MCP tool " + toolName);
    }
}
