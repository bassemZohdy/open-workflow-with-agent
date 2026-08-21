package org.acme.functions;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class StudioDocumentServiceTest {

    @TempDir
    Path workspace;

    @Test
    void listsWorkflowCatalogAndMalformedDocumentsWithoutDroppingMetadata() throws Exception {
        Path workflows = workspace.resolve("workflows/sub_flows");
        Path catalogs = workspace.resolve("workflows/catalogs");
        Files.createDirectories(workflows);
        Files.createDirectories(catalogs);
        Files.writeString(workflows.resolve("example.sw.yaml"), ""
                + "id: example\nversion: '1.0'\nspecVersion: '0.8'\nname: Example\n"
                + "states:\n  - name: Run\n    type: operation\n"
                + "functions:\n  - name: call\n    operation: demoCatalog#run\n");
        Files.writeString(catalogs.resolve("demo.yaml"), "openapi: 3.0.3\ninfo:\n  title: Demo\n");
        Files.writeString(workflows.resolve("broken.sw.yaml"), "id: [broken\n");
        Files.writeString(workflows.resolve("future.sw.yaml"), "id: future\nspecVersion: '1.0'\n");
        Files.writeString(workspace.resolve("workflows/marked.sw.yaml"), workflow("Marked")
                .replace("name: Marked", "name: Marked\nx-studio-reusable-subflow: true"));

        StudioDocumentService service = new StudioDocumentService(workspace);
        StudioDocumentService.DocumentList result = service.list(null, null, null, true, 1, 50);

        assertEquals(5, result.total());
        StudioDocumentService.DocumentSummary example = result.items().stream()
                .filter(item -> item.path().endsWith("example.sw.yaml")).findFirst().orElseThrow();
        assertEquals("workflow", example.kind());
        assertEquals("0.8", example.specVersion());
        assertEquals("example", example.workflowId());
        assertEquals("operation", example.stateTypes().iterator().next());
        assertTrue(example.catalogAliases().contains("demoCatalog"));
        assertTrue(example.functionReferences().contains("demoCatalog#run"));
        assertTrue(example.catalogReferences().isEmpty());
        assertEquals("valid", example.validationState());
        assertTrue(example.reusableSubflow());
        StudioDocumentService.DocumentSummary broken = result.items().stream()
                .filter(item -> item.path().endsWith("broken.sw.yaml")).findFirst().orElseThrow();
        assertTrue(broken.diagnostics().stream().anyMatch(item -> item.primaryRange() != null
                && item.primaryRange().start().line() == 1));
        StudioDocumentService.DocumentSummary future = result.items().stream()
                .filter(item -> item.path().endsWith("future.sw.yaml")).findFirst().orElseThrow();
        assertTrue(future.diagnostics().stream().anyMatch(item -> "studio.workflow.version".equals(item.ruleId())
                && item.primaryRange() != null));
        StudioDocumentService.DocumentSummary marked = result.items().stream()
                .filter(item -> item.path().endsWith("marked.sw.yaml")).findFirst().orElseThrow();
        assertTrue(marked.reusableSubflow());
        StudioDocumentService.DocumentSummary demo = result.items().stream()
                .filter(item -> item.path().endsWith("demo.yaml")).findFirst().orElseThrow();
        assertTrue(demo.diagnostics().stream().anyMatch(item -> "studio.required-field".equals(item.ruleId())
                && item.message().contains("paths")));
    }

    @Test
    void performsAtomicEtagProtectedLifecycleWithRecoverableTrash() throws Exception {
        StudioDocumentService service = new StudioDocumentService(workspace);
        String original = workflow("Lifecycle");
        StudioDocumentService.Document created = service.create("workflow", "sub_flows/lifecycle.sw.yaml",
                "yaml", original);
        assertTrue(Files.isRegularFile(workspace.resolve("workflows/sub_flows/lifecycle.sw.yaml")));

        assertThrows(StudioDocumentService.WorkspaceException.class,
                () -> service.update("workflow", created.id(), "yaml", workflow("Stale"), "\"sha256:stale\""));
        StudioDocumentService.Document updated = service.update("workflow", created.id(), "yaml",
                workflow("Updated"), created.etag());
        assertEquals("Updated", updated.name());
        StudioDocumentService.RenameResult renamed = service.rename("workflow", updated.id(),
                "sub_flows/renamed.sw.yaml", updated.etag());
        assertEquals("workflows/sub_flows/renamed.sw.yaml", renamed.document().path());

        StudioDocumentService.TrashReceipt receipt = service.delete("workflow", renamed.document().id(),
                renamed.document().etag(), false);
        assertFalse(Files.exists(workspace.resolve("workflows/sub_flows/renamed.sw.yaml")));
        StudioDocumentService.Document restored = service.restore(receipt.trashId());
        assertEquals("workflows/sub_flows/renamed.sw.yaml", restored.path());
        assertTrue(Files.isRegularFile(workspace.resolve("workflows/sub_flows/renamed.sw.yaml")));
    }

    @Test
    void rejectsMutationsWhenStudioWritesAreDisabled() throws Exception {
        StudioDocumentService service = new StudioDocumentService(workspace);
        service.writeEnabled = false;

        StudioDocumentService.WorkspaceException exception = assertThrows(
                StudioDocumentService.WorkspaceException.class,
                () -> service.create("workflow", "disabled.sw.yaml", "yaml", workflow("Disabled")));

        assertEquals("STUDIO_WRITE_DISABLED", exception.code());
        assertEquals(403, exception.status());
        assertFalse(Files.exists(workspace.resolve("workflows/disabled.sw.yaml")));
    }

    @Test
    void validatesExpressionPlacementWithoutEvaluatingExpressionText() throws Exception {
        Path workflows = workspace.resolve("workflows");
        Files.createDirectories(workflows);
        Files.writeString(workflows.resolve("expression-shape.sw.yaml"), ""
                + "id: expression_shape\nversion: '1.0'\nspecVersion: '0.8'\nname: Expression Shape\n"
                + "start: Decide\nstates:\n  - name: Decide\n    type: switch\n"
                + "    dataConditions:\n      - condition: true\n        transition: Decide\n");

        StudioDocumentService service = new StudioDocumentService(workspace);
        StudioDocumentService.DocumentList result = service
                .list("workflow", null, null, true, 1, 50);
        StudioDocumentService.DocumentSummary document = result.items().stream()
                .filter(item -> item.path().endsWith("expression-shape.sw.yaml")).findFirst().orElseThrow();
        assertTrue(document.diagnostics().stream().anyMatch(item -> "studio.workflow.expression-shape".equals(item.ruleId())
                && item.message().contains("authored text")));
        StudioDocumentService.ValidationResult validation = service.validate("workflow", document.id(), null,
                "yaml");
        assertEquals("Decide", validation.sourceTree().path("start").asText());
    }

    @Test
    void validatesDocumentDependencyAndWorkspaceScopesWithoutWriting() throws Exception {
        Path workflows = workspace.resolve("workflows");
        Path catalogs = workflows.resolve("catalogs");
        Path subflows = workflows.resolve("sub_flows");
        Files.createDirectories(catalogs);
        Files.createDirectories(subflows);
        Files.writeString(workflows.resolve("root.sw.yaml"), ""
                + "id: root\nversion: '1.0'\nspecVersion: '0.8'\nname: Root\nstart: Done\n"
                + "extensions:\n  - extensionid: workflow-uri-definitions\n    definitions:\n"
                + "      demo: catalogs/demo.yaml\nfunctions:\n  - name: call\n    operation: demo#run\n"
                + "states:\n  - name: Done\n    type: inject\n    subFlowRef: child\n    end: true\n");
        Files.writeString(subflows.resolve("child.sw.yaml"), workflow("Child"));
        Files.writeString(catalogs.resolve("demo.yaml"), ""
                + "openapi: 3.0.3\ninfo:\n  title: Demo\n  version: '1.0'\npaths:\n  /run:\n"
                + "    get:\n      operationId: run\n      responses:\n        '200':\n          description: ok\n");

        StudioDocumentService service = new StudioDocumentService(workspace);
        StudioDocumentService.DocumentSummary root = service
                .list("workflow", null, null, true, 1, 50).items().stream()
                .filter(item -> item.path().endsWith("root.sw.yaml")).findFirst().orElseThrow();
        String rootPath = workspace.resolve("workflows/root.sw.yaml").toString();

        StudioDocumentService.ValidationReport document = service.validateScope("document", "workflow",
                root.id(), null, null);
        StudioDocumentService.ValidationReport dependencies = service.validateScope("dependencies", "workflow",
                root.id(), null, null);
        StudioDocumentService.ValidationReport workspaceReport = service.validateScope("workspace", null, null,
                null, null);

        assertEquals("document", document.scope());
        assertEquals(1, document.documentsChecked());
        assertEquals(3, dependencies.documentsChecked());
        assertEquals(3, workspaceReport.documentsChecked());
        assertTrue(Files.exists(Path.of(rootPath)));
        assertTrue(document.valid());
        assertTrue(dependencies.valid());
        assertTrue(workspaceReport.valid());
    }

    @Test
    void validatesWorkflowGraphReferencesAndRuntimeSemantics() throws Exception {
        Path workflows = workspace.resolve("workflows");
        Files.createDirectories(workflows);
        Files.writeString(workflows.resolve("semantic.sw.yaml"), ""
                + "id: semantic\nversion: '1.0'\nspecVersion: '0.8'\nname: Semantic\n"
                + "start: Start\n"
                + "functions:\n  - name: invoke\n    operation: missingAlias#run\n"
                + "states:\n"
                + "  - name: Start\n    type: switch\n"
                + "    dataConditions:\n      - condition: '${ true }'\n        transition: Call\n"
                + "      - condition: '${ false }'\n        transition: Callback\n"
                + "  - name: Call\n    type: operation\n"
                + "    actions:\n      - name: Missing\n        functionRef:\n          refName: missingFunction\n"
                + "    transition: End\n"
                + "  - name: Callback\n    type: callback\n    transition: End\n"
                + "  - name: End\n    type: inject\n    end: true\n"
                + "  - name: Self\n    type: operation\n    transition: Self\n"
                + "  - name: Dead\n    type: operation\n"
                + "  - name: Orphan\n    type: inject\n    end: true\n"
                + "x-unknown-runtime-field: preserved\n");
        Files.writeString(workflows.resolve("duplicate.sw.yaml"), workflow("Duplicate")
                .replace("id: duplicate", "id: semantic"));

        StudioDocumentService service = new StudioDocumentService(workspace);
        StudioDocumentService.DocumentSummary document = service
                .list("workflow", null, null, true, 1, 50).items().stream()
                .filter(item -> item.path().endsWith("semantic.sw.yaml")).findFirst().orElseThrow();

        assertTrue(document.diagnostics().stream().anyMatch(item -> "studio.workflow.self-loop".equals(item.ruleId())));
        assertTrue(document.diagnostics().stream().anyMatch(item -> "studio.workflow.dead-end".equals(item.ruleId())));
        assertTrue(document.diagnostics().stream().anyMatch(item -> "studio.workflow.unreachable-state".equals(item.ruleId())));
        assertTrue(document.diagnostics().stream().anyMatch(item -> "studio.workflow.unresolved-function".equals(item.ruleId())));
        assertTrue(document.diagnostics().stream().anyMatch(item -> "studio.workflow.catalog-alias".equals(item.ruleId())));
        assertTrue(document.diagnostics().stream().anyMatch(item -> "studio.workflow.callback-event-correlation".equals(item.ruleId())));
        assertTrue(document.diagnostics().stream().anyMatch(item -> "studio.workflow.switch-default".equals(item.ruleId())));
        assertTrue(document.diagnostics().stream().anyMatch(item -> "studio.workflow.unknown-extension-field".equals(item.ruleId())));
        assertTrue(document.diagnostics().stream().anyMatch(item -> "studio.workflow.duplicate-id".equals(item.ruleId())));
        assertTrue(document.diagnostics().stream().allMatch(item -> item.primaryRange() != null));
        StudioDocumentService.Diagnostic selfLoop = document.diagnostics().stream()
                .filter(item -> "studio.workflow.self-loop".equals(item.ruleId())).findFirst().orElseThrow();
        assertEquals("/studio/validation-rules.html#studio.workflow.self-loop", selfLoop.documentationUrl());
        assertFalse(selfLoop.suppressible());
        StudioDocumentService.Diagnostic unknownExtension = document.diagnostics().stream()
                .filter(item -> "studio.workflow.unknown-extension-field".equals(item.ruleId())).findFirst().orElseThrow();
        assertTrue(unknownExtension.suppressible());
    }

    @Test
    void validatesWorkspaceCatalogOperationsAndSubflowTargets() throws Exception {
        Path workflows = workspace.resolve("workflows");
        Path catalogs = workflows.resolve("catalogs");
        Files.createDirectories(catalogs);
        Files.writeString(catalogs.resolve("available.yaml"), ""
                + "openapi: 3.0.3\ninfo:\n  title: Available\n  version: '1.0'\n"
                + "paths:\n  /run:\n    get:\n      operationId: run\n      responses: {}\n");
        Files.writeString(workflows.resolve("workspace-references.sw.yaml"), ""
                + "id: workspace_references\nversion: '1.0'\nspecVersion: '0.8'\n"
                + "name: Workspace References\nstart: Run\n"
                + "extensions:\n  - extensionid: workflow-uri-definitions\n"
                + "    definitions:\n      available: classpath:/catalogs/available.yaml\n"
                + "functions:\n  - name: invoke\n    operation: available#missing\n"
                + "states:\n  - name: Run\n    type: operation\n"
                + "    actions:\n      - name: Invoke\n        functionRef:\n          refName: invoke\n        subFlowRef: missing_subflow\n    end: true\n");

        StudioDocumentService service = new StudioDocumentService(workspace);
        StudioDocumentService.DocumentSummary document = service
                .list("workflow", null, null, true, 1, 50).items().stream()
                .filter(item -> item.path().endsWith("workspace-references.sw.yaml")).findFirst().orElseThrow();

        assertTrue(document.diagnostics().stream().anyMatch(item ->
                "studio.workflow.operation-unresolved".equals(item.ruleId())));
        assertTrue(document.diagnostics().stream().anyMatch(item ->
                "studio.workflow.subflow-unresolved".equals(item.ruleId())));
    }

    @Test
    void validatesCatalogOperationIdPresenceAndUniqueness() throws Exception {
        Path catalogs = workspace.resolve("workflows/catalogs");
        Files.createDirectories(catalogs);
        Files.writeString(catalogs.resolve("operation-ids.yaml"), ""
                + "openapi: 3.0.3\ninfo:\n  title: Operation IDs\n  version: '1.0'\n"
                + "paths:\n  /first:\n    get:\n      operationId: duplicate\n      responses: {}\n"
                + "  /second:\n    post:\n      operationId: duplicate\n      responses: {}\n"
                + "  /missing:\n    get:\n      operationId: ''\n      responses: {}\n");

        StudioDocumentService service = new StudioDocumentService(workspace);
        StudioDocumentService.DocumentSummary document = service
                .list("catalog", null, null, true, 1, 50).items().stream()
                .filter(item -> item.path().endsWith("operation-ids.yaml")).findFirst().orElseThrow();

        assertTrue(document.diagnostics().stream().anyMatch(item ->
                "studio.openapi.duplicate-operation-id".equals(item.ruleId())
                        && item.message().contains("duplicate")
                        && item.primaryRange() != null));
        assertTrue(document.diagnostics().stream().anyMatch(item ->
                "studio.openapi.operation-id".equals(item.ruleId())
                        && item.message().contains("non-empty")));
    }

    @Test
    void resolvesLocalRefsAndReportsUnresolvedOrExternalRefsWithoutDroppingUnknownFields() throws Exception {
        Path catalogs = workspace.resolve("workflows/catalogs");
        Files.createDirectories(catalogs);
        Files.writeString(catalogs.resolve("refs.yaml"), ""
                + "openapi: 3.0.3\ninfo:\n  title: Ref Catalog\n  version: '1.0'\n"
                + "paths:\n  /items:\n    get:\n      operationId: listItems\n      responses:\n"
                + "        '200':\n          description: OK\n          content:\n"
                + "            application/json:\n              schema:\n"
                + "                $ref: '#/components/schemas/Present'\n"
                + "        '404':\n          description: Missing\n          content:\n"
                + "            application/json:\n              schema:\n"
                + "                $ref: '#/components/schemas/Missing'\n"
                + "components:\n  schemas:\n    Present:\n      type: object\n"
                + "x-retained: authored\n"
                + "x-external-schema:\n  $ref: other.yaml#/components/schemas/Thing\n");

        StudioDocumentService service = new StudioDocumentService(workspace);
        StudioDocumentService.Document document = service
                .list("catalog", null, null, true, 1, 50).items().stream()
                .filter(item -> item.path().endsWith("refs.yaml"))
                .findFirst()
                .flatMap(item -> service.read("catalog", item.id()))
                .orElseThrow();

        assertTrue(document.diagnostics().stream().anyMatch(item ->
                "studio.openapi.unresolved-ref".equals(item.ruleId())
                        && item.message().contains("#/components/schemas/Missing")
                        && item.primaryRange() != null));
        assertTrue(document.diagnostics().stream().anyMatch(item ->
                "studio.openapi.external-ref".equals(item.ruleId())
                        && item.message().contains("other.yaml")));
        assertFalse(document.diagnostics().stream().anyMatch(item ->
                "studio.openapi.unresolved-ref".equals(item.ruleId())
                        && item.message().contains("#/components/schemas/Present")));
        assertEquals("authored", document.sourceTree().path("x-retained").asText());
    }

    @Test
    void rejectsDocumentsLargerThanTheImportLimit() {
        StudioDocumentService service = new StudioDocumentService(workspace);
        StudioDocumentService.WorkspaceException exception = assertThrows(
                StudioDocumentService.WorkspaceException.class,
                () -> service.create("catalog", "catalogs/large.yaml", "yaml",
                        "x".repeat(2 * 1024 * 1024 + 1)));
        assertEquals("STUDIO_DOCUMENT_TOO_LARGE", exception.code());
        assertEquals(400, exception.status());
    }

    @Test
    void updatesDependentCatalogPathsOperationIdsAndAliases() throws Exception {
        StudioDocumentService service = new StudioDocumentService(workspace);
        String catalogSource = ""
                + "openapi: 3.0.3\ninfo:\n  title: Dependency Catalog\n  version: '1.0'\n"
                + "paths:\n  /run:\n    get:\n      operationId: run\n      responses: {}\n"
                + "x-retained: true\n";
        StudioDocumentService.Document catalog = service.create("catalog", "catalogs/old.yaml", "yaml",
                catalogSource);
        StudioDocumentService.Document workflow = service.create("workflow", "dependent.sw.yaml", "yaml", ""
                + "id: dependent\nversion: '1.0'\nspecVersion: '0.8'\nname: Dependent\n"
                + "extensions:\n  - extensionid: workflow-uri-definitions\n"
                + "    definitions:\n      catalogAlias: classpath:/catalogs/old.yaml\n"
                + "functions:\n  - name: run\n    operation: catalogAlias#run\n"
                + "# preserve this authored comment\nstates: []\n");

        StudioDocumentService.Document operationRenamed = service.update("catalog", catalog.id(), "yaml",
                catalogSource.replace("operationId: run", "operationId: renamedRun"), catalog.etag());
        workflow = service.read("workflow", workflow.id()).orElseThrow();
        assertTrue(workflow.content().contains("operation: catalogAlias#renamedRun"));
        assertTrue(workflow.content().contains("# preserve this authored comment"));

        StudioDocumentService.RenameResult pathRenamed = service.rename("catalog", operationRenamed.id(),
                "catalogs/new.yaml", operationRenamed.etag());
        workflow = service.read("workflow", workflow.id()).orElseThrow();
        assertTrue(workflow.content().contains("classpath:/catalogs/new.yaml"));

        String aliasRenamedSource = workflow.content()
                .replace("catalogAlias: classpath:/catalogs/new.yaml", "renamedAlias: classpath:/catalogs/new.yaml");
        service.update("workflow", workflow.id(), "yaml", aliasRenamedSource, workflow.etag());
        workflow = service.read("workflow", workflow.id()).orElseThrow();
        assertTrue(workflow.content().contains("operation: renamedAlias#renamedRun"), workflow.content());
        assertEquals("workflows/catalogs/new.yaml", pathRenamed.document().path());
    }

    @Test
    void updatesDependentSubflowIdsAndFilenameReferencesTransactionally() throws Exception {
        StudioDocumentService service = new StudioDocumentService(workspace);
        StudioDocumentService.Document subflow = service.create("workflow",
                "sub_flows/original.sw.yaml", "yaml", workflow("Shared Step").replace("id: shared step", "id: shared_step"));
        String callerSource = ""
                + "id: caller\nversion: '1.0'\nspecVersion: '0.8'\nname: Caller\n"
                + "start: Run\nstates:\n  - name: Run\n    type: operation\n"
                + "    actions:\n      - name: By id\n        subFlowRef: shared_step\n"
                + "      - name: By path\n        subFlowRef: sub_flows/original.sw.yaml\n"
                + "    end: true\n# preserve caller comment\n";
        StudioDocumentService.Document caller = service.create("workflow", "caller.sw.yaml", "yaml",
                callerSource);

        String renamedIdSource = workflow("Shared Step").replace("id: shared step", "id: renamed_step");
        subflow = service.update("workflow", subflow.id(), "yaml", renamedIdSource, subflow.etag());
        caller = service.read("workflow", caller.id()).orElseThrow();
        assertTrue(caller.content().contains("subFlowRef: renamed_step"), caller.content());
        assertTrue(caller.content().contains("subFlowRef: sub_flows/original.sw.yaml"), caller.content());
        assertTrue(caller.content().contains("# preserve caller comment"), caller.content());
        String subflowId = subflow.id();
        String subflowEtag = subflow.etag();
        StudioDocumentService.WorkspaceException deleteConflict = assertThrows(
                StudioDocumentService.WorkspaceException.class,
                () -> service.delete("workflow", subflowId, subflowEtag, false));
        assertEquals(409, deleteConflict.status());
        assertTrue(deleteConflict.details().containsKey("dependencies"));

        StudioDocumentService.RenameResult pathRenamed = service.rename("workflow", subflow.id(),
                "sub_flows/renamed.sw.yaml", subflow.etag());
        caller = service.read("workflow", caller.id()).orElseThrow();
        assertTrue(caller.content().contains("subFlowRef: sub_flows/renamed.sw.yaml"), caller.content());
        assertEquals("workflows/sub_flows/renamed.sw.yaml", pathRenamed.document().path());
    }

    @Test
    void rejectsDirectAndIndirectSubflowCyclesBeforeSave() throws Exception {
        StudioDocumentService service = new StudioDocumentService(workspace);
        service.create("workflow", "sub_flows/create-a.sw.yaml", "yaml",
                subflowWorkflow("create_a", "create_b"));
        StudioDocumentService.WorkspaceException createCycle = assertThrows(
                StudioDocumentService.WorkspaceException.class,
                () -> service.create("workflow", "sub_flows/create-b.sw.yaml", "yaml",
                        subflowWorkflow("create_b", "create_a")));
        assertEquals("STUDIO_SUBFLOW_CYCLE", createCycle.code());
        assertFalse(Files.exists(workspace.resolve("workflows/sub_flows/create-b.sw.yaml")));

        StudioDocumentService.Document directA = service.create("workflow", "sub_flows/direct-a.sw.yaml",
                "yaml", subflowWorkflow("direct_a", null));
        StudioDocumentService.Document directB = service.create("workflow", "sub_flows/direct-b.sw.yaml",
                "yaml", subflowWorkflow("direct_b", null));
        directA = service.update("workflow", directA.id(), "yaml",
                subflowWorkflow("direct_a", "direct_b"), directA.etag());
        StudioDocumentService.WorkspaceException directCycle = assertThrows(
                StudioDocumentService.WorkspaceException.class,
                () -> service.update("workflow", directB.id(), "yaml",
                        subflowWorkflow("direct_b", "direct_a"), directB.etag()));
        assertEquals("STUDIO_SUBFLOW_CYCLE", directCycle.code());

        StudioDocumentService.Document indirectA = service.create("workflow", "sub_flows/indirect-a.sw.yaml",
                "yaml", subflowWorkflow("indirect_a", null));
        StudioDocumentService.Document indirectB = service.create("workflow", "sub_flows/indirect-b.sw.yaml",
                "yaml", subflowWorkflow("indirect_b", null));
        StudioDocumentService.Document indirectC = service.create("workflow", "sub_flows/indirect-c.sw.yaml",
                "yaml", subflowWorkflow("indirect_c", null));
        indirectA = service.update("workflow", indirectA.id(), "yaml",
                subflowWorkflow("indirect_a", "indirect_b"), indirectA.etag());
        indirectB = service.update("workflow", indirectB.id(), "yaml",
                subflowWorkflow("indirect_b", "indirect_c"), indirectB.etag());
        StudioDocumentService.WorkspaceException indirectCycle = assertThrows(
                StudioDocumentService.WorkspaceException.class,
                () -> service.update("workflow", indirectC.id(), "yaml",
                        subflowWorkflow("indirect_c", "indirect_a"), indirectC.etag()));
        assertEquals("STUDIO_SUBFLOW_CYCLE", indirectCycle.code());
    }

    @Test
    void rejectsUnsafePathsAndReferencedDeletes() throws Exception {
        StudioDocumentService service = new StudioDocumentService(workspace);
        assertThrows(StudioDocumentService.WorkspaceException.class,
                () -> service.create("workflow", "../escape.sw.yaml", "yaml", workflow("Escape")));
        assertThrows(StudioDocumentService.WorkspaceException.class,
                () -> service.create("workflow", "/tmp/escape.sw.yaml", "yaml", workflow("Escape")));

        StudioDocumentService.Document catalog = service.create("catalog", "catalogs/dependency.yaml", "yaml",
                "openapi: 3.0.3\ninfo:\n  title: Dependency\n  version: '1.0'\npaths: {}\n");
        service.create("workflow", "dependent.sw.yaml", "yaml", ""
                + "id: dependent\nversion: '1.0'\nspecVersion: '0.8'\nname: Dependent\n"
                + "start: End\nextensions:\n  - definitions:\n      dep: classpath:/catalogs/dependency.yaml\n"
                + "states:\n  - name: End\n    type: operation\n    end: true\n");
        StudioDocumentService.WorkspaceException exception = assertThrows(
                StudioDocumentService.WorkspaceException.class,
                () -> service.delete("catalog", catalog.id(), catalog.etag(), false));
        assertEquals(409, exception.status());
        assertTrue(exception.details().containsKey("dependencies"));
        service.delete("catalog", catalog.id(), catalog.etag(), true);
    }

    private static String workflow(String name) {
        return "id: " + name.toLowerCase() + "\nversion: '1.0'\nspecVersion: '0.8'\n"
                + "name: " + name + "\nstart: End\nstates:\n  - name: End\n    type: operation\n    end: true\n";
    }

    private static String subflowWorkflow(String id, String reference) {
        String action = reference == null ? "" : "    actions:\n      - name: Call\n        subFlowRef: " + reference + "\n";
        return "id: " + id + "\nversion: '1.0'\nspecVersion: '0.8'\n"
                + "name: " + id + "\nstart: Run\nstates:\n  - name: Run\n    type: operation\n"
                + action + "    end: true\n";
    }
}
