package org.acme.functions;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.equalTo;

import io.quarkus.test.junit.QuarkusTest;
import io.quarkus.test.junit.QuarkusTestProfile;
import io.quarkus.test.junit.TestProfile;
import java.util.Map;
import org.junit.jupiter.api.Test;

@QuarkusTest
@TestProfile(StudioRuntimeValidationDisabledResourceTest.Profile.class)
class StudioRuntimeValidationDisabledResourceTest {

    @Test
    void isExplicitlyDisabledOutsideConfiguredProfiles() {
        given()
                .when()
                .post("/api/studio/v1/runtime-validation/workflow/unknown")
                .then()
                .statusCode(403)
                .body("code", equalTo("STUDIO_RUNTIME_VALIDATION_DISABLED"));
    }

    public static class Profile implements QuarkusTestProfile {
        @Override
        public Map<String, String> getConfigOverrides() {
            return Map.of("studio.runtime-validation.enabled", "false");
        }
    }
}
