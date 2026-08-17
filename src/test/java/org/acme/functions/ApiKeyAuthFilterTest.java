package org.acme.functions;

import static io.restassured.RestAssured.given;

import java.util.Map;

import org.junit.jupiter.api.Test;

import static org.hamcrest.Matchers.anyOf;
import static org.hamcrest.Matchers.is;

import io.quarkus.test.junit.QuarkusTest;
import io.quarkus.test.junit.QuarkusTestProfile;
import io.quarkus.test.junit.TestProfile;

@QuarkusTest
@TestProfile(ApiKeyAuthFilterTest.WithApiKey.class)
class ApiKeyAuthFilterTest {

    @Test
    void rejectsRequestsMissingTheApiKey() {
        given()
                .contentType("application/json")
                .body("{\"payload\":{\"task\":\"hi\"}}")
                .when()
                .post("/agent/sync")
                .then()
                .statusCode(401);
    }

    @Test
    void rejectsRequestsWithTheWrongApiKey() {
        given()
                .header("Authorization", "Bearer wrong-key")
                .contentType("application/json")
                .body("{\"payload\":{\"task\":\"hi\"}}")
                .when()
                .post("/agent/sync")
                .then()
                .statusCode(401);
    }

    @Test
    void acceptsRequestsWithTheConfiguredApiKey() {
        given()
                .header("Authorization", "Bearer test-secret-123")
                .contentType("application/json")
                .body("{\"payload\":{\"task\":\"hi\"}}")
                .when()
                .post("/agent/sync")
                .then()
                .statusCode(200);
    }

    @Test
    void neverGatesManagementEndpoints() {
        given()
                .when()
                .get("/q/health")
                .then()
                .statusCode(200);
    }

    @Test
    void rejectsPathTraversalVariant() {
        // Undertow normalizes traversal before JAX-RS routing; the request is still blocked
        // (401 when it resolves to a gated route, 404 when it resolves to no route).
        given()
                .when()
                .post("/agent/../agent/sync")
                .then()
                .statusCode(anyOf(is(401), is(404)));
    }

    @Test
    void rejectsDoubleSlashVariant() {
        given()
                .when()
                .post("/agent//sync")
                .then()
                .statusCode(anyOf(is(401), is(404)));
    }

    @Test
    void rejectsEncodedSlashVariant() {
        given()
                .when()
                .post("/agent/%2Fsync")
                .then()
                .statusCode(anyOf(is(401), is(404)));
    }

    @Test
    void gatesWorkflowEndpointsToo() {
        given()
                .contentType("application/json")
                .body("{\"messages\":[{\"role\":\"user\",\"content\":\"hi\"}]}")
                .when()
                .post("/llm_chat")
                .then()
                .statusCode(401);
    }

    @Test
    void rejectsUnauthenticatedCloudEventIngress() {
        given()
                .contentType("application/cloudevents+json")
                .body("{}").when()
                .post("/agent/response-event")
                .then()
                .statusCode(401);
    }

    public static final class WithApiKey implements QuarkusTestProfile {
        @Override
        public Map<String, String> getConfigOverrides() {
            return Map.of("utility.api-key", "test-secret-123");
        }
    }
}
