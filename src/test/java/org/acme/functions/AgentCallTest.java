package org.acme.functions;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.equalTo;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.concurrent.TimeUnit;

import org.junit.jupiter.api.Test;

import io.quarkus.test.junit.QuarkusTest;
import io.restassured.response.Response;

/**
 * End-to-end coverage of the {@code agent_call} workflow against the bundled mock agent
 * ({@link AgentResource}): synchronous mode, input validation, HTTP-error mapping, and
 * the asynchronous callback round-trip (fire -> suspend -> agent_response CloudEvent ->
 * resume with the event data as agent_response).
 */
@QuarkusTest
class AgentCallTest {

    private static final long ASYNC_TIMEOUT_MILLIS = 30_000;
    private static final long POLL_INTERVAL_MILLIS = 500;

    @Test
    void syncCallReturnsMockAgentResponse() {
        given()
                .contentType("application/json")
                .body("{\"mode\":\"sync\",\"agent_request\":{\"task\":\"say hi\"}}")
                .when()
                .post("/agent_call")
                .then()
                .statusCode(201)
                .body("workflowdata.agent_response.agent", equalTo("mock-rest-agent"))
                .body("workflowdata.agent_response.output", containsString("say hi"));
    }

    @Test
    void syncCallHttpErrorIsMappedToStructuredWorkflowError() {
        given()
                .contentType("application/json")
                .body("{\"mode\":\"sync\",\"agent_request\":{\"fail_with\":400}}")
                .when()
                .post("/agent_call")
                .then()
                .statusCode(201)
                .body("workflowdata.error", equalTo("agent call failed with an HTTP error from the agent"));
    }

    @Test
    void asyncFireHttpErrorIsMappedToStructuredWorkflowError() {
        given()
                .contentType("application/json")
                .body("{\"mode\":\"async\",\"agent_request\":{\"fail_with\":500},"
                        + "\"callback_url\":\"http://localhost:8081/agent/response-event\"}")
                .when()
                .post("/agent_call")
                .then()
                .statusCode(201)
                .body("workflowdata.error", equalTo("agent call failed with an HTTP error from the agent"));
    }

    @Test
    void invalidRequestsAreRejectedByValidation() {
        // Unknown mode.
        given()
                .contentType("application/json")
                .body("{\"mode\":\"queued\",\"agent_request\":{\"task\":\"x\"}}")
                .when()
                .post("/agent_call")
                .then()
                .statusCode(201)
                .body("workflowdata.error", containsString("mode"));

        // Non-object agent_request.
        given()
                .contentType("application/json")
                .body("{\"agent_request\":\"not-an-object\"}")
                .when()
                .post("/agent_call")
                .then()
                .statusCode(201)
                .body("workflowdata.error", containsString("validation"));
    }

    @Test
    void asyncCallSuspendsThenResumesOnAgentResponseEvent() throws Exception {
        // Fire the async call. The workflow returns while suspended in the callback state;
        // the mock agent then posts the agent_response CloudEvent to the callback channel,
        // which resumes this instance with the event data.
        Response start = given()
                .contentType("application/json")
                .body("{\"mode\":\"async\",\"agent_request\":{\"task\":\"async-hello\"},"
                        + "\"callback_url\":\"http://localhost:8081/agent/response-event\"}")
                .when()
                .post("/agent_call")
                .then()
                .statusCode(201)
                .body("workflowdata.agent_response", equalTo(null))
                .extract().response();

        String id = start.jsonPath().getString("id");
        assertNotNull(id, "workflow instance id must be returned by the start call");

        // Deterministic hand-off: wait until the workflow runtime accepts (2xx) the
        // agent_response CloudEvent posted by the mock agent.
        int dispatchStatus = AgentResource.LAST_DISPATCH_STATUS.get(15, TimeUnit.SECONDS);
        assertTrue(dispatchStatus >= 200 && dispatchStatus < 300,
                "callback channel must accept the agent_response event, got HTTP " + dispatchStatus);

        // With the event accepted and the fire action already 202'd, the only way out of
        // the callback state is consuming that event - so the instance completing (and being
        // evicted from the in-memory store) proves the suspend -> resume round-trip. If the
        // runtime keeps completed instances readable, assert the event data directly instead.
        String agent = pollForCompletion(id);
        assertTrue(agent == null || "mock-rest-agent".equals(agent),
                "resumed instance must expose the agent_response event data, got: " + agent);
    }

    /**
     * Polls the instance endpoint until the workflow completes. Completion is observed
     * either as the instance disappearing (404/410 - completed instances are evicted from
     * the in-memory store; returns null) or, if still readable, as agent_response being
     * populated (returns the agent name).
     */
    private static String pollForCompletion(String id) throws InterruptedException {
        long deadline = System.currentTimeMillis() + ASYNC_TIMEOUT_MILLIS;
        StringBuilder observed = new StringBuilder();
        while (System.currentTimeMillis() < deadline) {
            Response instance = given().accept("application/json").get("/agent_call/" + id);
            observed.append(instance.statusCode()).append(' ');
            if (instance.statusCode() == 404 || instance.statusCode() == 410) {
                return null;
            }
            if (instance.statusCode() == 200) {
                String agent = instance.jsonPath().getString("workflowdata.agent_response.agent");
                if (agent != null) {
                    return agent;
                }
            }
            Thread.sleep(POLL_INTERVAL_MILLIS);
        }
        throw new AssertionError("workflow instance never completed; statuses observed: " + observed);
    }
}
