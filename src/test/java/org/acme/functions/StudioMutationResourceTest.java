package org.acme.functions;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.notNullValue;

import io.quarkus.test.junit.QuarkusTest;
import io.quarkus.test.junit.QuarkusTestProfile;
import io.quarkus.test.junit.TestProfile;
import io.restassured.http.ContentType;
import java.io.IOException;
import java.nio.file.FileVisitResult;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.SimpleFileVisitor;
import java.nio.file.attribute.BasicFileAttributes;
import java.util.Map;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

@QuarkusTest
@TestProfile(StudioMutationResourceTest.Profile.class)
class StudioMutationResourceTest {

    private static final Path ROOT = Path.of("target/studio-api-test-root");
    private static final String CONTENT = "id: api\nversion: '1.0'\nspecVersion: '0.8'\n"
            + "name: API Workflow\nstart: End\nstates:\n  - name: End\n    type: operation\n    end: true\n";

    @BeforeEach
    void cleanRoot() throws IOException {
        deleteTree(ROOT);
        Files.createDirectories(ROOT.resolve("workflows"));
    }

    @AfterAll
    static void cleanAfterAll() throws IOException {
        deleteTree(ROOT);
    }

    @Test
    void exposesCreateUpdateRenameDeleteAndRestoreWithPreconditions() {
        String id = given()
                .contentType(ContentType.JSON)
                .body(Map.of("kind", "workflow", "path", "sub_flows/api.sw.yaml", "format", "yaml",
                        "content", CONTENT))
                .when()
                .post("/api/studio/v1/documents")
                .then()
                .statusCode(201)
                .header("ETag", notNullValue())
                .extract().path("id");

        String etag = given().accept(ContentType.JSON).when()
                .get("/api/studio/v1/documents/workflow/" + id)
                .then().statusCode(200).extract().header("ETag");
        given().contentType(ContentType.JSON).body(Map.of("content", CONTENT.replace("API Workflow", "Updated")))
                .when().put("/api/studio/v1/documents/workflow/" + id)
                .then().statusCode(428);

        String updatedEtag = given().contentType(ContentType.JSON).header("If-Match", etag)
                .body(Map.of("content", CONTENT.replace("API Workflow", "Updated")))
                .when().put("/api/studio/v1/documents/workflow/" + id)
                .then().statusCode(200).extract().header("ETag");
        given().contentType(ContentType.JSON).header("If-Match", etag)
                .body(Map.of("content", CONTENT.replace("API Workflow", "Stale")))
                .when().put("/api/studio/v1/documents/workflow/" + id)
                .then().statusCode(409).body("code", equalTo("STUDIO_REVISION_CONFLICT"))
                .body("actualEtag", equalTo(updatedEtag));

        given().contentType(ContentType.JSON).header("If-Match", updatedEtag)
                .body(Map.of("path", "sub_flows/renamed-api.sw.yaml"))
                .when().post("/api/studio/v1/documents/workflow/" + id + "/rename")
                .then().statusCode(200).body("document.path", equalTo("workflows/sub_flows/renamed-api.sw.yaml"));

        String renamedId = StudioDocumentService.documentId("workflow", "workflows/sub_flows/renamed-api.sw.yaml");
        String renamedEtag = given().accept(ContentType.JSON).when()
                .get("/api/studio/v1/documents/workflow/" + renamedId)
                .then().statusCode(200).extract().header("ETag");
        String trashId = given().header("If-Match", renamedEtag).when()
                .delete("/api/studio/v1/documents/workflow/" + renamedId)
                .then().statusCode(202).extract().path("trashId");

        given().header("If-None-Match", "*").when()
                .post("/api/studio/v1/trash/" + trashId + "/restore")
                .then().statusCode(201).body("path", equalTo("workflows/sub_flows/renamed-api.sw.yaml"));
    }

    @Test
    void rejectsUnsafeCreatePaths() {
        given().contentType(ContentType.JSON)
                .body(Map.of("kind", "workflow", "path", "../escape.sw.yaml", "content", CONTENT))
                .when().post("/api/studio/v1/documents")
                .then().statusCode(400).body("code", equalTo("STUDIO_INVALID_PATH"));
    }

    public static class Profile implements QuarkusTestProfile {
        @Override
        public Map<String, String> getConfigOverrides() {
            return Map.of("studio.workspace.root", ROOT.toString());
        }
    }

    private static void deleteTree(Path root) throws IOException {
        if (!Files.exists(root)) return;
        Files.walkFileTree(root, new SimpleFileVisitor<>() {
            @Override
            public FileVisitResult visitFile(Path file, BasicFileAttributes attrs) throws IOException {
                Files.deleteIfExists(file);
                return FileVisitResult.CONTINUE;
            }

            @Override
            public FileVisitResult postVisitDirectory(Path dir, IOException exception) throws IOException {
                if (exception != null) throw exception;
                Files.deleteIfExists(dir);
                return FileVisitResult.CONTINUE;
            }
        });
    }
}
