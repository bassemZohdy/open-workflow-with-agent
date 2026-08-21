package org.acme.functions;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.equalTo;

import io.quarkus.test.junit.QuarkusTest;
import io.quarkus.test.junit.QuarkusTestProfile;
import io.quarkus.test.junit.TestProfile;
import io.restassured.http.ContentType;
import java.util.Map;
import org.junit.jupiter.api.Test;

@QuarkusTest
@TestProfile(StudioReadOnlyResourceTest.Profile.class)
class StudioReadOnlyResourceTest {

    @Test
    void rejectsStudioMutationWhenTheWriteCapabilityIsNotEnabled() {
        given()
                .contentType(ContentType.JSON)
                .body(Map.of(
                        "kind", "workflow",
                        "path", "disabled.sw.yaml",
                        "format", "yaml",
                        "content", "id: disabled\n"))
                .when()
                .post("/api/studio/v1/documents")
                .then()
                .statusCode(403)
                .body("code", equalTo("STUDIO_WRITE_DISABLED"));
    }

    public static class Profile implements QuarkusTestProfile {
        @Override
        public Map<String, String> getConfigOverrides() {
            return Map.of(
                    "studio.workspace.root", "target/studio-read-only-test-root",
                    "studio.write-enabled", "false");
        }
    }
}

