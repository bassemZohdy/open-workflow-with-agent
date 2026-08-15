package org.acme.functions;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

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
 * Local short/long-term agent memory store backing {@code memory-catalog.yaml}.
 *
 * <p>The backing {@link BoundedCache} caps entry *count*; this resource additionally caps
 * per-entry key/value byte sizes so the aggregate memory footprint stays bounded (Step 36 of
 * the hardening backlog: ~10k entries x 10 MB bodies would otherwise be retainable for the
 * full TTL).
 */
@Path("/functions/memory")
@Produces(MediaType.APPLICATION_JSON)
public class MemoryResource {
    private static final Logger LOG = Logger.getLogger(MemoryResource.class);
    private static final int MAX_STORE_ENTRIES = 10_000;
    private static final long STORE_TTL_MILLIS = java.util.concurrent.TimeUnit.HOURS.toMillis(1);
    private static final int MAX_KEY_BYTES = 256;
    private static final int MAX_VALUE_BYTES = 4 * 1024;
    private static final int DEFAULT_TOP_K = 3;
    private static final int MAX_TOP_K = 10;

    private final BoundedCache<String, String> memoryStore = new BoundedCache<>(MAX_STORE_ENTRIES, STORE_TTL_MILLIS);

    @GET
    @Path("/get")
    public Map<String, String> getMemory(@QueryParam("key") String key) {
        if (key == null || key.isBlank()) {
            throw new BadRequestException("key is required for memory retrieval");
        }
        String value = memoryStore.getOrDefault(key, "");
        LOG.infof("Memory retrieve executed key=%s found=%s", LogSanitizer.safe(key), !value.isEmpty());
        return Map.of("key", key, "value", value);
    }

    @POST
    @Path("/set")
    @Consumes(MediaType.APPLICATION_JSON)
    public Map<String, String> setMemory(Map<String, String> request) {
        if (request == null || !request.containsKey("key") || !request.containsKey("value")) {
            throw new BadRequestException("key and value are required for memory storage");
        }
        String key = request.get("key");
        String value = request.get("value");
        rejectOversized(key, "key", MAX_KEY_BYTES);
        rejectOversized(value, "value", MAX_VALUE_BYTES);
        memoryStore.put(key, value);
        LOG.infof("Memory set executed key=%s", LogSanitizer.safe(key));
        return Map.of("key", key, "status", "stored");
    }

    @POST
    @Path("/search")
    @Consumes(MediaType.APPLICATION_JSON)
    public Map<String, Object> searchMemory(Map<String, Object> request) {
        if (request == null || !request.containsKey("query")) {
            throw new BadRequestException("query is required for memory search");
        }
        String query = String.valueOf(request.get("query"));
        int topK = parseTopK(request.get("top_k"));
        // Mock semantic search: fabricate `top_k` matches so the advertised catalog parameter is
        // actually consumed (rather than silently ignored as before).
        List<Map<String, Object>> matches = new ArrayList<>();
        for (int i = 1; i <= topK; i++) {
            matches.add(Map.of(
                    "key", "context_summary_" + i,
                    "score", Math.max(0.0, 0.95 - (i - 1) * 0.1),
                    "value", "Relevant context for " + query + " (match " + i + ")"));
        }
        LOG.infof("Memory search executed query=%s top_k=%s", LogSanitizer.safe(query), topK);
        return Map.of("query", query, "matches", matches);
    }

    private static int parseTopK(Object raw) {
        if (raw == null) {
            return DEFAULT_TOP_K;
        }
        try {
            int topK = Integer.parseInt(String.valueOf(raw));
            return Math.max(1, Math.min(topK, MAX_TOP_K));
        } catch (NumberFormatException e) {
            throw new BadRequestException("top_k must be an integer");
        }
    }

    private static void rejectOversized(String value, String field, int maxBytes) {
        int bytes = value.getBytes(StandardCharsets.UTF_8).length;
        if (bytes > maxBytes) {
            throw new WebApplicationException(Response.status(Response.Status.REQUEST_ENTITY_TOO_LARGE)
                    .type(MediaType.APPLICATION_JSON)
                    .entity(Map.of("error", field + " exceeds maximum size of " + maxBytes + " bytes"))
                    .build());
        }
    }
}
