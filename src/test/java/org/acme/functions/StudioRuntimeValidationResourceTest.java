package org.acme.functions;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.greaterThan;

import io.quarkus.test.junit.QuarkusTest;
import io.quarkus.test.junit.QuarkusTestProfile;
import io.quarkus.test.junit.TestProfile;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import org.junit.jupiter.api.Test;

@QuarkusTest
@TestProfile(StudioRuntimeValidationResourceTest.Profile.class)
class StudioRuntimeValidationResourceTest {

    @Test
    void validatesWithTheBundledParserWithoutExecutingOrWritingTheWorkflow() throws Exception {
        Path source = Path.of("workflows/agent-call.sw.yaml");
        String before = Files.readString(source);

        given()
                .header("X-Request-ID", "runtime-validation-test")
                .when()
                .post("/api/studio/v1/runtime-validation/workflow/"
                        + StudioDocumentService.documentId("workflow", "workflows/agent-call.sw.yaml"))
                .then()
                .statusCode(200)
                .header("X-Request-ID", equalTo("runtime-validation-test"))
                .header("X-Studio-API-Version", equalTo("1"))
                .body("specificationStatus", equalTo("valid"))
                .body("runtimeStatus", equalTo("valid"))
                .body("deploymentStatus", equalTo("not-evaluated"))
                .body("executionStatus", equalTo("not-evaluated"))
                .body("valid", equalTo(true))
                .body("readOnly", equalTo(true))
                .body("sideEffectsExecuted", equalTo(false))
                .body("compiledNodeCount", greaterThan(0))
                .body("diagnostics", equalTo(java.util.List.of()));

        org.junit.jupiter.api.Assertions.assertEquals(before, Files.readString(source));
    }

    @Test
    void rejectsCatalogsAtTheWorkflowRuntimeBoundary() {
        given()
                .when()
                .post("/api/studio/v1/runtime-validation/catalog/catalog-does-not-matter")
                .then()
                .statusCode(400)
                .body("code", equalTo("STUDIO_RUNTIME_WORKFLOW_REQUIRED"));
    }

    public static class Profile implements QuarkusTestProfile {
        @Override
        public Map<String, String> getConfigOverrides() {
            return Map.of(
                    "studio.runtime-validation.enabled", "true",
                    "studio.runtime-validation.timeout", "10s",
                    "studio.runtime-validation.max-concurrency", "1",
                    "studio.runtime-validation.max-output-bytes", "65536");
        }
    }
}
