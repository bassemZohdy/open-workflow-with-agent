package org.acme.functions;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.equalTo;

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
@TestProfile(StudioOriginValidationFilterTest.Profile.class)
class StudioOriginValidationFilterTest {

    private static final Path ROOT = Path.of("target/studio-origin-test-root");
    private static final String CONTENT = "id: origin\nversion: '1.0'\nspecVersion: '0.8'\n"
            + "name: Origin\nstart: End\nstates:\n  - name: End\n    type: inject\n    end: true\n";

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
    void rejectsCrossOriginStudioMutations() {
        given()
                .header("Authorization", "Bearer origin-test-key")
                .header("Origin", "https://evil.example.test")
                .contentType(ContentType.JSON)
                .body(Map.of("kind", "workflow", "path", "evil.sw.yaml", "format", "yaml", "content", CONTENT))
                .when()
                .post("/api/studio/v1/documents")
                .then()
                .statusCode(403)
                .body("code", equalTo("STUDIO_ORIGIN_FORBIDDEN"));
    }

    @Test
    void acceptsAnExplicitlyAllowlistedStudioOrigin() {
        given()
                .header("Authorization", "Bearer origin-test-key")
                .header("Origin", "https://studio.example.test")
                .contentType(ContentType.JSON)
                .body(Map.of("kind", "workflow", "path", "allowed.sw.yaml", "format", "yaml", "content", CONTENT))
                .when()
                .post("/api/studio/v1/documents")
                .then()
                .statusCode(201);
    }

    public static class Profile implements QuarkusTestProfile {
        @Override
        public Map<String, String> getConfigOverrides() {
            return Map.of(
                    "utility.api-key", "origin-test-key",
                    "studio.write-enabled", "true",
                    "studio.workspace.root", ROOT.toString(),
                    "studio.allowed-origins", "https://studio.example.test");
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
