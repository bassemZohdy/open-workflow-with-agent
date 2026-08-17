package org.acme.functions;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;

import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import jakarta.inject.Inject;
import jakarta.ws.rs.BadRequestException;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;

import org.jboss.logging.Logger;
import org.eclipse.microprofile.config.inject.ConfigProperty;

import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * Bundled mock implementation of the generic agent REST contract in
 * {@code catalogs/agent-rest.yaml}. It exists so the {@code agent_call} workflow has a
 * self-contained, deterministic target for local demos and tests - point
 * {@code AGENT_BASE_URL} at any real agent implementing the same two operations and the
 * workflows need no changes.
 *
 * <p>The agent's "intelligence" is intentionally out of scope here: it echoes a capped
 * summary of the request payload. For contract testing, a {@code fail_with} field
 * (400 or 500) in the payload makes the mock answer with that HTTP status instead.
 */
@Path("/agent")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
public class AgentResource {

    private static final Logger LOG = Logger.getLogger(AgentResource.class);
    private static final ObjectMapper MAPPER = new ObjectMapper();
    /** Hard cap on how much of the (untrusted) payload is echoed back or logged. */
    private static final int MAX_ECHO_LENGTH = 200;

    /**
     * Test/diagnostics hook: per-workflow-instance futures that complete with the HTTP
     * status of that instance's callback dispatch once the workflow runtime definitively
     * accepts (2xx) or rejects it (-1 on transport failure). Keyed by workflow instance id
     * so concurrent async dispatches are tracked independently; entries are retained after
     * completion so late lookups still resolve (bounded by the number of async calls this
     * mock serves per uptime - not a production concern).
     */
    static final Map<String, CompletableFuture<Integer>> DISPATCH_STATUSES = new ConcurrentHashMap<>();

    /**
     * Test/diagnostics accessor: the dispatch-status future for a given workflow instance.
     * Unknown ids (no dispatch attempted, e.g. the fire failed with an HTTP error) resolve
     * immediately to -1.
     */
    static CompletableFuture<Integer> dispatchStatusFor(String workflowInstanceId) {
        return DISPATCH_STATUSES.getOrDefault(workflowInstanceId, CompletableFuture.completedFuture(-1));
    }

    private HttpClient httpClient;

    @Inject
    @ConfigProperty(name = "agent.callback.allowed-hosts", defaultValue = "")
    String allowedCallbackHosts;

    @Inject
    @ConfigProperty(name = "agent.callback.connect-timeout", defaultValue = "5s")
    Duration callbackConnectTimeout;

    @Inject
    @ConfigProperty(name = "agent.callback.request-timeout", defaultValue = "10s")
    Duration callbackRequestTimeout;

    @Inject
    @ConfigProperty(name = "agent.callback.attempts", defaultValue = "5")
    int callbackAttempts;

    @Inject
    @ConfigProperty(name = "agent.callback.retry-delay", defaultValue = "500ms")
    Duration callbackRetryDelay;

    private CallbackUrlValidator callbackUrlValidator;

    @PostConstruct
    void init() {
        httpClient = HttpClient.newBuilder()
                .connectTimeout(callbackConnectTimeout)
                .followRedirects(HttpClient.Redirect.NEVER)
                .build();
        callbackUrlValidator = new CallbackUrlValidator(allowedCallbackHosts);
    }

    @PreDestroy
    void destroy() {
        // HttpClient has no close() before Java 21; dropping the reference is sufficient here.
        httpClient = null;
    }

    /**
     * Synchronous agent call: answers immediately with a deterministic response echoing
     * (a capped summary of) the payload.
     */
    @POST
    @Path("/sync")
    public Map<String, Object> sync(Map<String, Object> body) {
        if (body == null || body.isEmpty()) {
            throw new BadRequestException("sync request body must be a non-empty JSON object");
        }
        Map<String, Object> payload = payloadOf(body);
        int failWith = failWith(payload);
        if (failWith != 0) {
            LOG.infof("mock agent sync failing on request with fail_with=%d", failWith);
            throw failWith == 400 ? new BadRequestException("mock agent induced 400")
                    : new jakarta.ws.rs.InternalServerErrorException("mock agent induced 500");
        }
        LOG.infof("mock agent sync executed payload=%s", LogSanitizer.safe(MAPPER.valueToTree(payload).toString()));
        return Map.of(
                "agent", "mock-rest-agent",
                "output", "Acknowledged: " + summarize(payload));
    }

    /**
     * Asynchronous agent call: accepts the request with 202 immediately, then posts the
     * completion event - a structured CloudEvent of type {@code agent_response} with the
     * {@code kogitoprocrefid} extension set to the calling workflow instance - to the
     * provided callback URL. The returned future lets tests await the dispatch; the
     * endpoint itself never blocks on it.
     */
    @POST
    @Path("/async")
    public Map<String, Object> async(Map<String, Object> body) {
        if (body == null) {
            throw new BadRequestException("async request body must be a JSON object");
        }
        String callbackUrl = stringField(body, "callback_url");
        String workflowInstanceId = stringField(body, "workflow_instance_id");
        if (callbackUrl.isBlank() || workflowInstanceId.isBlank()) {
            throw new BadRequestException("callback_url and workflow_instance_id are required and must be non-blank");
        }
        Map<String, Object> payload = payloadOf(body);
        int failWith = failWith(payload);
        if (failWith != 0) {
            // The fire itself fails with an HTTP error - exercises the callback state's onErrors.
            LOG.infof("mock agent async failing on request with fail_with=%d", failWith);
            throw failWith == 400 ? new BadRequestException("mock agent induced 400")
                    : new jakarta.ws.rs.InternalServerErrorException("mock agent induced 500");
        }
        final URI callbackUri;
        try {
            callbackUri = callbackUrlValidator.validate(callbackUrl);
        } catch (IllegalArgumentException e) {
            throw new BadRequestException(e.getMessage());
        }
        dispatchCallback(callbackUri, workflowInstanceId, payload);
        return Map.of(
                "status", "accepted",
                "workflow_instance_id", workflowInstanceId);
    }

    /**
     * Posts the {@code agent_response} CloudEvent to the callback URL and returns a future
     * completing with the final dispatch status (2xx accepted, other HTTP code rejected,
     * -1 transport failure). Visible for tests, which may await it and assert on delivery.
     *
     * <p>The dispatch is deliberately delayed and retried: the caller (the workflow's
     * callback state) only finishes suspending its instance after this endpoint returns its
     * 202, so an immediately-fired event could beat the suspension and be dropped. Real
     * agents take far longer than this delay to produce a response; the retry also covers
     * restarts of the receiving endpoint.
     */
    CompletableFuture<Integer> dispatchCallback(URI callbackUri, String workflowInstanceId, Map<String, Object> payload) {
        Map<String, Object> event = Map.ofEntries(
                Map.entry("specversion", "1.0"),
                Map.entry("id", UUID.randomUUID().toString()),
                // Empty source: matches the workflow's event definition (source: ""), per
                // the upstream SonataFlow callback-over-http example.
                Map.entry("source", ""),
                Map.entry("type", "agent_response"),
                Map.entry("time", OffsetDateTime.now().toString()),
                Map.entry("datacontenttype", "application/json"),
                // Correlation attribute: SonataFlow matches the suspended callback state's
                // instance with this event through kogitoprocrefid.
                Map.entry("kogitoprocrefid", workflowInstanceId),
                Map.entry("data", Map.of(
                        "agent", "mock-rest-agent",
                        "output", "Acknowledged: " + summarize(payload))));
        LOG.infof("mock agent dispatching agent_response event to callback url=%s procref=%s",
                LogSanitizer.safe(callbackUri.toString()), LogSanitizer.safe(workflowInstanceId));
        CompletableFuture<Integer> status = DISPATCH_STATUSES
                .computeIfAbsent(workflowInstanceId, ignored -> new CompletableFuture<>());
        // Initial delay so the caller's callback state can finish suspending its instance
        // before the event lands (see method javadoc).
        return CompletableFuture.runAsync(() -> { },
                        CompletableFuture.delayedExecutor(retryDelayMillis(), TimeUnit.MILLISECONDS))
                .thenCompose(ignored -> dispatchWithRetry(callbackUri, event, Math.max(1, callbackAttempts)))
                .whenComplete((code, error) -> status.complete(error != null ? -1 : code));
    }

    /** Final dispatch outcome per workflow instance id; -1 signals a transport failure. */
    private CompletableFuture<Integer> dispatchWithRetry(URI callbackUri, Map<String, Object> event, int attemptsLeft) {
        HttpRequest.Builder requestBuilder = HttpRequest.newBuilder(callbackUri)
                .timeout(callbackRequestTimeout)
                .header("Content-Type", "application/cloudevents+json");
        if (isLocalHost(callbackUri) && allowedCallbackHosts != null && !allowedCallbackHosts.isBlank()
                && utilityApiKey() != null && !utilityApiKey().isBlank()) {
            requestBuilder.header("Authorization", "Bearer " + utilityApiKey());
        }
        HttpRequest request;
        try {
            request = requestBuilder
                    .POST(HttpRequest.BodyPublishers.ofString(MAPPER.writeValueAsString(event)))
                    .build();
        } catch (Exception e) {
            return CompletableFuture.failedFuture(e);
        }
        return httpClient.sendAsync(request, HttpResponse.BodyHandlers.ofString())
                .thenCompose(response -> {
                    if (response.statusCode() >= 200 && response.statusCode() < 300) {
                        return CompletableFuture.completedFuture(response.statusCode());
                    }
                    if (attemptsLeft <= 1) {
                        LOG.warnf("agent_response event not accepted after retries (HTTP %d): %s",
                                response.statusCode(), LogSanitizer.safe(response.body()));
                        return CompletableFuture.completedFuture(response.statusCode());
                    }
                    return scheduleRetry(callbackUri, event, attemptsLeft - 1);
                })
                .exceptionallyCompose(error -> {
                    if (attemptsLeft <= 1) {
                        LOG.warnf("agent_response event dispatch failed after retries: %s", error.getMessage());
                        return CompletableFuture.completedFuture(-1);
                    }
                    return scheduleRetry(callbackUri, event, attemptsLeft - 1);
                });
    }

    private CompletableFuture<Integer> scheduleRetry(URI callbackUri, Map<String, Object> event, int attemptsLeft) {
        LOG.infof("agent_response event rejected; retrying in %d ms (%d attempts left)",
                retryDelayMillis(), attemptsLeft);
        return CompletableFuture.runAsync(() -> { },
                        CompletableFuture.delayedExecutor(retryDelayMillis(), TimeUnit.MILLISECONDS))
                .thenCompose(ignored -> dispatchWithRetry(callbackUri, event, attemptsLeft));
    }

    private long retryDelayMillis() {
        return Math.max(1L, callbackRetryDelay.toMillis());
    }

    private String utilityApiKey() {
        return org.eclipse.microprofile.config.ConfigProvider.getConfig()
                .getOptionalValue("utility.api-key", String.class)
                .orElse("");
    }

    private static boolean isLocalHost(URI uri) {
        String host = uri.getHost();
        return host != null && (host.equalsIgnoreCase("localhost")
                || host.equals("127.0.0.1")
                || host.equals("::1"));
    }

    private static Map<String, Object> payloadOf(Map<String, Object> body) {
        Object payload = body.get("payload");
        return payload instanceof Map ? cast(payload) : Map.of();
    }

    private static int failWith(Map<String, Object> payload) {
        Object failWith = payload.get("fail_with");
        if (failWith instanceof Number number) {
            int code = number.intValue();
            if (code == 400 || code == 500) {
                return code;
            }
        }
        return 0;
    }

    private static String stringField(Map<String, Object> body, String field) {
        Object value = body.get(field);
        return value == null ? "" : String.valueOf(value);
    }

    private static String summarize(Map<String, Object> payload) {
        String json = payload.isEmpty() ? "{}" : MAPPER.valueToTree(payload).toString();
        return json.length() <= MAX_ECHO_LENGTH ? json : json.substring(0, MAX_ECHO_LENGTH) + "…(truncated)";
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> cast(Object value) {
        return (Map<String, Object>) value;
    }
}
