package org.acme.functions;

import static io.restassured.RestAssured.given;

import java.util.Map;

import org.junit.jupiter.api.Test;

import io.quarkus.test.junit.QuarkusTest;
import io.quarkus.test.junit.QuarkusTestProfile;
import io.quarkus.test.junit.TestProfile;

@QuarkusTest
@TestProfile(ApiKeyAuthFilterTest.WithApiKey.class)
class ApiKeyAuthFilterTest {

    @Test
    void rejectsRequestsMissingTheApiKey() {
        given()
                .when()
                .get("/functions/time?timezone=UTC")
                .then()
                .statusCode(401);
    }

    @Test
    void rejectsRequestsWithTheWrongApiKey() {
        given()
                .header("Authorization", "Bearer wrong-key")
                .when()
                .get("/functions/time?timezone=UTC")
                .then()
                .statusCode(401);
    }

    @Test
    void acceptsRequestsWithTheConfiguredApiKey() {
        given()
                .header("Authorization", "Bearer test-secret-123")
                .when()
                .get("/functions/time?timezone=UTC")
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

    public static final class WithApiKey implements QuarkusTestProfile {
        @Override
        public Map<String, String> getConfigOverrides() {
            return Map.of("utility.api-key", "test-secret-123");
        }
    }
}
