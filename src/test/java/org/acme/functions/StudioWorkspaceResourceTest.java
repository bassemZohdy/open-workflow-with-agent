package org.acme.functions;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.hasItems;
import static org.hamcrest.Matchers.equalTo;

import org.junit.jupiter.api.Test;

import io.quarkus.test.junit.QuarkusTest;

@QuarkusTest
class StudioWorkspaceResourceTest {

    @Test
    void listsCanonicalWorkflowsSubflowsAndCatalogsWithStableMetadata() {
        given()
                .header("X-Request-ID", "studio-list-test")
                .accept("application/json")
                .when()
                .get("/api/studio/v1/documents?includeDiagnostics=true&pageSize=200")
                .then()
                .statusCode(200)
                .header("X-Request-ID", equalTo("studio-list-test"))
                .header("X-Studio-API-Version", equalTo("1"))
                .body("total", equalTo(6))
                .body("items.path", hasItems(
                        "workflows/agent-call.sw.yaml",
                        "workflows/sub_flows/boolean-decision.sw.yaml",
                        "workflows/catalogs/agent-rest.yaml"))
                .body("items.id", hasItems(
                        StudioDocumentService.documentId("workflow", "workflows/agent-call.sw.yaml"),
                        StudioDocumentService.documentId("catalog", "workflows/catalogs/agent-rest.yaml")));
    }

    @Test
    void filtersCatalogsAndSearchesCanonicalPaths() {
        given()
                .accept("application/json")
                .when()
                .get("/api/studio/v1/documents?kind=catalog&query=openai&pageSize=200")
                .then()
                .statusCode(200)
                .body("total", equalTo(1))
                .body("items[0].path", equalTo("workflows/catalogs/openai-compatible.yaml"));
    }

    @Test
    void readsCanonicalSourceWithMetadataAndGenericSourceTree() {
        String id = StudioDocumentService.documentId("workflow", "workflows/agent-call.sw.yaml");
        given()
                .accept("application/json")
                .when()
                .get("/api/studio/v1/documents/workflow/" + id)
                .then()
                .statusCode(200)
                .body("id", equalTo(id))
                .body("path", equalTo("workflows/agent-call.sw.yaml"))
                .body("content", org.hamcrest.Matchers.containsString("specVersion: '0.8'"))
                .body("metadata.workflowId", equalTo("agent_call"))
                .body("metadata.name", equalTo("Agent Call"))
                .body("metadata.stateCounts.switch", equalTo(3))
                .body("functionReferences", hasItems("agentCatalog#agentSyncCall", "agentCatalog#agentAsyncCall"))
                .body("catalogReferences", hasItems("catalogs/agent-rest.yaml"))
                .body("sourceTree.id", equalTo("agent_call"));
    }

    @Test
    void validatesTheEntireWorkspaceThroughTheReadOnlyScopeEndpoint() {
        given()
                .header("X-Request-ID", "studio-validation-test")
                .contentType("application/json")
                .body("{\"scope\":\"workspace\"}")
                .when()
                .post("/api/studio/v1/documents/validate")
                .then()
                .statusCode(200)
                .header("X-Request-ID", equalTo("studio-validation-test"))
                .header("X-Studio-API-Version", equalTo("1"))
                .body("scope", equalTo("workspace"))
                .body("documentsChecked", equalTo(6));
    }
}
