package org.acme.functions;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.JsonLocation;
import com.fasterxml.jackson.annotation.JsonUnwrapped;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.dataformat.yaml.YAMLFactory;
import jakarta.annotation.PostConstruct;
import jakarta.enterprise.context.ApplicationScoped;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.FileAlreadyExistsException;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.attribute.PosixFilePermission;
import java.nio.file.FileVisitResult;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.SimpleFileVisitor;
import java.nio.file.attribute.BasicFileAttributes;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.EnumSet;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.UUID;
import java.util.stream.Collectors;
import java.util.stream.Stream;
import org.jboss.logging.Logger;
import org.eclipse.microprofile.config.inject.ConfigProperty;

/** Read-only inventory of the canonical workflow package. */
@ApplicationScoped
public class StudioDocumentService {

    private static final long MAX_DOCUMENT_BYTES = 2L * 1024 * 1024;
    private static final String WORKFLOW_PREFIX = "workflows/";
    private static final String VALIDATION_RULE_SET = "studio-validation-2026-08-20.1";
    private static final String WORKFLOW_PROFILE = "workflow-0.8-local-1";
    private static final String CATALOG_PROFILE = "openapi-3.x-local-1";
    private static final String TRASH_PREFIX = ".studio/trash/";
    private static final Logger LOG = Logger.getLogger(StudioDocumentService.class);
    private final ObjectMapper jsonMapper = new ObjectMapper();
    private final ObjectMapper yamlMapper = new ObjectMapper(new YAMLFactory());

    @ConfigProperty(name = "studio.workspace.root", defaultValue = ".")
    String configuredRoot;

    @ConfigProperty(name = "studio.write-enabled", defaultValue = "false")
    boolean writeEnabled;

    private Path workspaceRoot;

    @PostConstruct
    void initialize() {
        workspaceRoot = Path.of(configuredRoot).toAbsolutePath().normalize();
    }

    StudioDocumentService() {
        // CDI constructor.
    }

    StudioDocumentService(Path root) {
        workspaceRoot = root.toAbsolutePath().normalize();
        // Direct service tests exercise the mutation implementation without CDI configuration.
        writeEnabled = true;
    }

    Path workspaceRoot() {
        return workspaceRoot;
    }

    public DocumentList list(String requestedKind, String prefix, String query,
            boolean includeDiagnostics, int page, int pageSize) {
        int safePage = Math.max(page, 1);
        int safePageSize = Math.min(Math.max(pageSize, 1), 200);
        List<DocumentSummary> matching = inventory(requestedKind, prefix, query, includeDiagnostics);
        long requestedOffset = ((long) safePage - 1L) * safePageSize;
        int from = requestedOffset >= matching.size() ? matching.size() : (int) requestedOffset;
        int to = Math.min(from + safePageSize, matching.size());
        return new DocumentList(matching.subList(from, to), safePage, safePageSize, matching.size());
    }

    public Optional<Document> read(String requestedKind, String documentId) {
        if (!"workflow".equals(requestedKind) && !"catalog".equals(requestedKind)) return Optional.empty();
        DocumentSummary summary = inventory(requestedKind, null, null, true).stream()
                .filter(candidate -> candidate.id().equals(documentId))
                .findFirst().orElse(null);
        if (summary == null) return Optional.empty();
        Path source = workspaceRoot.resolve(summary.path()).normalize();
        if (!source.startsWith(workspaceRoot.resolve("workflows").normalize())) return Optional.empty();
        try {
            byte[] bytes = Files.readAllBytes(source);
            ParseResult parsed = parse(bytes, summary.format(), summary.kind());
            return Optional.of(new Document(summary, new String(bytes, StandardCharsets.UTF_8),
                    parsed.metadata(), parsed.sourceTree()));
        } catch (IOException exception) {
            return Optional.empty();
        }
    }

    public Document create(String requestedKind, String requestedPath, String requestedFormat,
            String content) {
        requireWriteEnabled();
        String kind = requireKind(requestedKind);
        String path = normalizeDocumentPath(kind, requestedPath);
        String format = resolveFormat(path, requestedFormat);
        byte[] bytes = checkedContent(content);
        if ("workflow".equals(kind)) {
            ParseResult candidate = parse(bytes, format, kind);
            List<Diagnostic> cycles = dependencyCycleDiagnostics(path, content, candidate);
            if (!cycles.isEmpty()) {
                throw conflict("STUDIO_SUBFLOW_CYCLE", "The workflow creation would create a subflow dependency cycle",
                        Map.of("diagnostics", cycles));
            }
        }
        Path target = secureMutationPath(kind, path, true);
        if (Files.exists(target, java.nio.file.LinkOption.NOFOLLOW_LINKS)) {
            throw conflict("STUDIO_DUPLICATE_PATH", "A canonical document already exists at " + path,
                    Map.of("path", path));
        }
        try {
            atomicWrite(target, bytes, null);
        } catch (IOException exception) {
            throw failure("STUDIO_WRITE_FAILED", "The document could not be created", exception);
        }
        audit("create", kind, path, etag(bytes), null);
        return readRequired(kind, documentId(kind, path));
    }

    public Document update(String requestedKind, String documentId, String requestedFormat,
            String content, String ifMatch) {
        requireWriteEnabled();
        String kind = requireKind(requestedKind);
        DocumentSummary current = summaryRequired(kind, documentId);
        requireMatch(current, ifMatch);
        String format = resolveFormat(current.path(), requestedFormat);
        Document existing = readRequired(kind, documentId);
        String nextContent = content;
        List<FileRewrite> dependentRewrites = List.of();
        if ("workflow".equals(kind)) {
            nextContent = rewriteWorkflowAliasReferences(existing.content(), content, format);
            String previousId = workflowId(existing.content(), format);
            String nextId = workflowId(nextContent, format);
            if (previousId != null && nextId != null && !previousId.equals(nextId)) {
                nextContent = replaceSubflowReferenceValue(nextContent, previousId, nextId);
                dependentRewrites = dependentSubflowIdRewrites(current.id(), previousId, nextId);
            }
        }
        byte[] bytes = checkedContent(nextContent);
        if ("catalog".equals(kind)) {
            dependentRewrites = dependentOperationRewrites(current.path(), existing.content(), nextContent, format);
        }
        if ("workflow".equals(kind)) {
            ParseResult candidate = parse(bytes, format, kind);
            List<Diagnostic> cycles = dependencyCycleDiagnostics(current.path(), nextContent, candidate);
            if (!cycles.isEmpty()) {
                throw conflict("STUDIO_SUBFLOW_CYCLE", "The workflow change would create a subflow dependency cycle",
                        Map.of("diagnostics", cycles));
            }
        }
        Path target = secureMutationPath(kind, current.path(), false);
        try {
            atomicWrite(target, bytes, target);
            writeRewrites(dependentRewrites);
        } catch (IOException exception) {
            restoreRewrite(target, existing.content().getBytes(StandardCharsets.UTF_8), dependentRewrites);
            throw failure("STUDIO_WRITE_FAILED", "The document could not be updated", exception);
        }
        audit("update", kind, current.path(), etag(bytes), current.etag());
        return readRequired(kind, documentId(kind, current.path()));
    }

    public RenameResult rename(String requestedKind, String documentId, String requestedPath,
            String ifMatch) {
        requireWriteEnabled();
        String kind = requireKind(requestedKind);
        DocumentSummary current = summaryRequired(kind, documentId);
        requireMatch(current, ifMatch);
        String path = normalizeDocumentPath(kind, requestedPath);
        resolveFormat(path, null);
        Path source = secureMutationPath(kind, current.path(), false);
        Path target = secureMutationPath(kind, path, true);
        if (Files.exists(target, java.nio.file.LinkOption.NOFOLLOW_LINKS)) {
            throw conflict("STUDIO_DUPLICATE_PATH", "A canonical document already exists at " + path,
                    Map.of("path", path));
        }
        List<FileRewrite> dependentRewrites = "catalog".equals(kind)
                ? dependentCatalogPathRewrites(current.path(), path)
                : "workflow".equals(kind)
                        ? dependentSubflowPathRewrites(current.id(), current.path(), path)
                        : List.of();
        try {
            moveAtomically(source, target, false);
            writeRewrites(dependentRewrites);
        } catch (IOException exception) {
            restoreRewrites(dependentRewrites);
            try {
                if (Files.exists(target, java.nio.file.LinkOption.NOFOLLOW_LINKS)) {
                    moveAtomically(target, source, false);
                }
            } catch (IOException ignored) {
                // Preserve the original failure; recovery tooling can inspect the moved file.
            }
            throw failure("STUDIO_RENAME_FAILED", "The document could not be renamed", exception);
        }
        Document renamed = readRequired(kind, documentId(kind, path));
        audit("rename", kind, path, renamed.etag(), current.etag());
        return new RenameResult(renamed, current.id(), current.path());
    }

    private void writeRewrites(List<FileRewrite> rewrites) throws IOException {
        for (FileRewrite rewrite : rewrites) {
            atomicWrite(rewrite.path(), rewrite.updated(), rewrite.path());
        }
    }

    private void restoreRewrite(Path primary, byte[] original, List<FileRewrite> rewrites) {
        try {
            atomicWrite(primary, original, primary);
        } catch (IOException ignored) {
            // Keep the original mutation failure; recovery tooling can inspect the workspace.
        }
        restoreRewrites(rewrites);
    }

    private void restoreRewrites(List<FileRewrite> rewrites) {
        for (FileRewrite rewrite : rewrites) {
            try {
                atomicWrite(rewrite.path(), rewrite.original(), rewrite.path());
            } catch (IOException ignored) {
                // Keep the original mutation failure; recovery tooling can inspect the workspace.
            }
        }
    }

    private List<FileRewrite> dependentCatalogPathRewrites(String oldPath, String newPath) {
        List<FileRewrite> rewrites = new ArrayList<>();
        for (DocumentSummary candidate : inventory("workflow", null, null, false)) {
            Document workflow = readRequired("workflow", candidate.id());
            String updated = replaceCatalogPathReferences(workflow.content(), workflow.format(), oldPath, newPath);
            if (!updated.equals(workflow.content())) {
                rewrites.add(new FileRewrite(
                        secureMutationPath("workflow", workflow.path(), false),
                        workflow.content().getBytes(StandardCharsets.UTF_8),
                        updated.getBytes(StandardCharsets.UTF_8)));
            }
        }
        return rewrites;
    }

    private List<FileRewrite> dependentOperationRewrites(String catalogPath, String previous, String next,
            String format) {
        ParseResult previousParsed = parse(previous.getBytes(StandardCharsets.UTF_8), format, "catalog");
        ParseResult nextParsed = parse(next.getBytes(StandardCharsets.UTF_8), format, "catalog");
        Map<String, String> previousOperations = catalogOperationIds(previousParsed.sourceTree());
        Map<String, String> nextOperations = catalogOperationIds(nextParsed.sourceTree());
        Map<String, String> changes = new LinkedHashMap<>();
        for (Map.Entry<String, String> entry : previousOperations.entrySet()) {
            String replacement = nextOperations.get(entry.getKey());
            if (replacement != null && !replacement.equals(entry.getValue())
                    && !replacement.isBlank() && !entry.getValue().isBlank()) {
                changes.put(entry.getValue(), replacement);
            }
        }
        if (changes.isEmpty()) return List.of();

        List<FileRewrite> rewrites = new ArrayList<>();
        for (DocumentSummary candidate : inventory("workflow", null, null, false)) {
            Document workflow = readRequired("workflow", candidate.id());
            Map<String, String> aliases = workflowCatalogAliases(
                    parse(workflow.content().getBytes(StandardCharsets.UTF_8), workflow.format(), "workflow")
                            .sourceTree());
            List<String> matchingAliases = aliases.entrySet().stream()
                    .filter(entry -> sameCatalogPath(entry.getValue(), catalogPath))
                    .map(Map.Entry::getKey)
                    .toList();
            String updated = workflow.content();
            for (String alias : matchingAliases) {
                for (Map.Entry<String, String> change : changes.entrySet()) {
                    updated = replaceOperationReference(updated, alias, change.getKey(), change.getValue());
                }
            }
            if (!updated.equals(workflow.content())) {
                rewrites.add(new FileRewrite(
                        secureMutationPath("workflow", workflow.path(), false),
                        workflow.content().getBytes(StandardCharsets.UTF_8),
                        updated.getBytes(StandardCharsets.UTF_8)));
            }
        }
        return rewrites;
    }

    private List<FileRewrite> dependentSubflowIdRewrites(String changedDocumentId,
            String previousId, String nextId) {
        List<FileRewrite> rewrites = new ArrayList<>();
        for (DocumentSummary candidate : inventory("workflow", null, null, false)) {
            if (candidate.id().equals(changedDocumentId)) continue;
            Document workflow = readRequired("workflow", candidate.id());
            String updated = replaceSubflowReferenceValue(workflow.content(), previousId, nextId);
            if (!updated.equals(workflow.content())) {
                rewrites.add(new FileRewrite(
                        secureMutationPath("workflow", workflow.path(), false),
                        workflow.content().getBytes(StandardCharsets.UTF_8),
                        updated.getBytes(StandardCharsets.UTF_8)));
            }
        }
        return rewrites;
    }

    private List<FileRewrite> dependentSubflowPathRewrites(String changedDocumentId,
            String previousPath, String nextPath) {
        List<FileRewrite> rewrites = new ArrayList<>();
        String previousRelative = relativeWorkflowPath(previousPath);
        String nextRelative = relativeWorkflowPath(nextPath);
        for (DocumentSummary candidate : inventory("workflow", null, null, false)) {
            if (candidate.id().equals(changedDocumentId)) continue;
            Document workflow = readRequired("workflow", candidate.id());
            String updated = workflow.content();
            for (String previousReference : List.of(previousPath, previousRelative)) {
                String nextReference = previousReference.equals(previousPath) ? nextPath : nextRelative;
                updated = replaceSubflowReferenceValue(updated, previousReference, nextReference);
            }
            if (!updated.equals(workflow.content())) {
                rewrites.add(new FileRewrite(
                        secureMutationPath("workflow", workflow.path(), false),
                        workflow.content().getBytes(StandardCharsets.UTF_8),
                        updated.getBytes(StandardCharsets.UTF_8)));
            }
        }
        return rewrites;
    }

    private String workflowId(String source, String format) {
        ParseResult parsed = parse(source.getBytes(StandardCharsets.UTF_8), format, "workflow");
        return text(parsed.sourceTree(), "id");
    }

    private static String relativeWorkflowPath(String path) {
        return path.startsWith(WORKFLOW_PREFIX) ? path.substring(WORKFLOW_PREFIX.length()) : path;
    }

    private static String replaceSubflowReferenceValue(String source, String oldReference,
            String newReference) {
        if (oldReference == null || newReference == null || oldReference.isBlank()
                || oldReference.equals(newReference)) return source;
        String prefix = "((?i:[\"']?subFlowRef[\"']?)\\s*:\\s*)";
        String updated = source.replaceAll(
                prefix + Pattern.quote("\"" + oldReference + "\""),
                "$1" + Matcher.quoteReplacement("\"" + newReference + "\""));
        updated = updated.replaceAll(
                prefix + Pattern.quote("'" + oldReference + "'"),
                "$1" + Matcher.quoteReplacement("'" + newReference + "'"));
        return updated.replaceAll(
                prefix + Pattern.quote(oldReference) + "(?=[ \\t]*(?:[,}\\]\\n]|$))",
                "$1" + Matcher.quoteReplacement(newReference));
    }

    private String rewriteWorkflowAliasReferences(String previous, String next, String format) {
        Map<String, String> previousAliases = workflowCatalogAliases(
                parse(previous.getBytes(StandardCharsets.UTF_8), format, "workflow").sourceTree());
        Map<String, String> nextAliases = workflowCatalogAliases(
                parse(next.getBytes(StandardCharsets.UTF_8), format, "workflow").sourceTree());
        String updated = next;
        for (Map.Entry<String, String> previousEntry : previousAliases.entrySet()) {
            for (Map.Entry<String, String> nextEntry : nextAliases.entrySet()) {
                if (sameCatalogPath(previousEntry.getValue(), nextEntry.getValue())
                        && !previousEntry.getKey().equals(nextEntry.getKey())) {
                    updated = replaceOperationAlias(updated, previousEntry.getKey(), nextEntry.getKey());
                }
            }
        }
        return updated;
    }

    private static Map<String, String> workflowCatalogAliases(JsonNode root) {
        Map<String, String> aliases = new LinkedHashMap<>();
        if (root == null || !root.isObject()) return aliases;
        JsonNode extensions = root.path("extensions");
        if (!extensions.isArray()) return aliases;
        for (JsonNode extension : extensions) {
            if (!"workflow-uri-definitions".equals(text(extension, "extensionid"))) continue;
            JsonNode definitions = extension.path("definitions");
            if (!definitions.isObject()) continue;
            definitions.fields().forEachRemaining(entry -> {
                if (entry.getValue().isTextual()) aliases.put(entry.getKey(), entry.getValue().asText());
            });
        }
        return aliases;
    }

    private static Map<String, String> catalogOperationIds(JsonNode root) {
        Map<String, String> operations = new LinkedHashMap<>();
        if (root == null || !root.isObject()) return operations;
        JsonNode paths = root.path("paths");
        if (!paths.isObject()) return operations;
        paths.fields().forEachRemaining(path -> {
            if (!path.getValue().isObject()) return;
            path.getValue().fields().forEachRemaining(method -> {
                if (!Set.of("get", "put", "post", "delete", "options", "head", "patch", "trace")
                        .contains(method.getKey().toLowerCase(Locale.ROOT))) return;
                String operationId = text(method.getValue(), "operationId");
                if (operationId != null && !operationId.isBlank()) {
                    operations.put(method.getKey().toLowerCase(Locale.ROOT) + " " + path.getKey(), operationId);
                }
            });
        });
        return operations;
    }

    private static String replaceCatalogPathReferences(String source, String format,
            String oldPath, String newPath) {
        String oldRelative = oldPath.startsWith(WORKFLOW_PREFIX)
                ? oldPath.substring(WORKFLOW_PREFIX.length()) : oldPath;
        String newRelative = newPath.startsWith(WORKFLOW_PREFIX)
                ? newPath.substring(WORKFLOW_PREFIX.length()) : newPath;
        String oldClasspath = "classpath:/" + oldRelative;
        String newClasspath = "classpath:/" + newRelative;
        if ("json".equals(format)) return source.replace(oldClasspath, newClasspath);
        String updated = source;
        for (String oldReference : List.of(oldClasspath, oldRelative, oldPath)) {
            String newReference = oldReference.equals(oldClasspath)
                    ? newClasspath : oldReference.equals(oldRelative) ? newRelative : newPath;
            updated = replaceDefinitionValue(updated, oldReference, newReference);
        }
        return updated;
    }

    private static String replaceDefinitionValue(String source, String oldReference, String newReference) {
        String[] lines = source.split("\\r?\\n", -1);
        boolean inDefinitions = false;
        int definitionsIndent = -1;
        for (int index = 0; index < lines.length; index++) {
            String line = lines[index];
            String trimmed = line.trim();
            int indent = line.length() - line.stripLeading().length();
            if (trimmed.equals("definitions:")) {
                inDefinitions = true;
                definitionsIndent = indent;
                continue;
            }
            if (inDefinitions && !trimmed.isEmpty() && !trimmed.startsWith("#") && indent <= definitionsIndent) {
                inDefinitions = false;
            }
            if (inDefinitions && line.contains(oldReference)) lines[index] = line.replace(oldReference, newReference);
        }
        return String.join("\n", lines);
    }

    private static String replaceOperationReference(String source, String alias,
            String oldOperation, String newOperation) {
        String oldReference = alias + "#" + oldOperation;
        String newReference = alias + "#" + newOperation;
        String[] lines = source.split("\\r?\\n", -1);
        for (int index = 0; index < lines.length; index++) {
            String trimmed = lines[index].stripLeading();
            if ((trimmed.startsWith("operation:") || trimmed.startsWith("operation :")
                    || trimmed.startsWith("\"operation\"") || trimmed.startsWith("'operation'"))
                    && lines[index].contains(oldReference)) {
                lines[index] = lines[index].replace(oldReference, newReference);
            }
        }
        return String.join("\n", lines);
    }

    private static String replaceOperationAlias(String source, String oldAlias, String newAlias) {
        String[] lines = source.split("\\r?\\n", -1);
        String oldPrefix = oldAlias + "#";
        String newPrefix = newAlias + "#";
        for (int index = 0; index < lines.length; index++) {
            String trimmed = lines[index].stripLeading();
            if ((trimmed.startsWith("operation:") || trimmed.startsWith("operation :")
                    || trimmed.startsWith("\"operation\"") || trimmed.startsWith("'operation'"))
                    && lines[index].contains(oldPrefix)) {
                lines[index] = lines[index].replace(oldPrefix, newPrefix);
            }
        }
        return String.join("\n", lines);
    }

    private static boolean sameCatalogPath(String reference, String path) {
        String normalized = reference == null ? "" : reference.replace("\\", "/");
        if (normalized.startsWith("classpath:/")) normalized = normalized.substring("classpath:/".length());
        if (normalized.startsWith(WORKFLOW_PREFIX)) normalized = normalized.substring(WORKFLOW_PREFIX.length());
        String target = path.replace("\\", "/");
        if (target.startsWith("classpath:/")) target = target.substring("classpath:/".length());
        if (target.startsWith(WORKFLOW_PREFIX)) target = target.substring(WORKFLOW_PREFIX.length());
        return normalized.equals(target);
    }

    public TrashReceipt delete(String requestedKind, String documentId, String ifMatch,
            boolean acceptDependencyImpact) {
        requireWriteEnabled();
        String kind = requireKind(requestedKind);
        DocumentSummary current = summaryRequired(kind, documentId);
        requireMatch(current, ifMatch);
        List<Reference> references = referencesTo(current);
        if (!references.isEmpty() && !acceptDependencyImpact) {
            throw conflict("STUDIO_DEPENDENCIES_EXIST",
                    "The document is referenced by other canonical documents",
                    Map.of("path", current.path(), "dependencies", references));
        }
        Path source = secureMutationPath(kind, current.path(), false);
        String trashId = UUID.randomUUID().toString().replace("-", "");
        Path entry = secureTrashEntry(trashId);
        Path payload = entry.resolve("payload");
        try {
            Files.createDirectories(entry);
            moveAtomically(source, payload, false);
            TrashMetadata metadata = new TrashMetadata(trashId, kind, current.path(), current.id(),
                    current.etag(), Instant.now().toString(), Instant.now().plusSeconds(7 * 24 * 60 * 60).toString());
            Files.writeString(entry.resolve("metadata.json"), jsonMapper.writeValueAsString(metadata),
                    StandardCharsets.UTF_8);
        } catch (Exception exception) {
            try {
                if (Files.exists(payload)) moveAtomically(payload, source, false);
            } catch (IOException ignored) {
                // Keep the original failure; audit and recovery tooling can inspect the trash entry.
            }
            throw failure("STUDIO_DELETE_FAILED", "The document could not be moved to recoverable trash", exception);
        }
        audit("delete", kind, current.path(), current.etag(), null);
        return new TrashReceipt(trashId, current.path(), current.etag(), Instant.now(),
                Instant.now().plusSeconds(7 * 24 * 60 * 60),
                new GenerationStatus("out_of_sync", null, null, "Canonical source was moved to trash"));
    }

    public Document restore(String trashId) {
        requireWriteEnabled();
        if (trashId == null || !trashId.matches("[A-Za-z0-9_-]{8,128}")) {
            throw badRequest("STUDIO_INVALID_TRASH_ID", "The trash identifier is invalid");
        }
        Path entry = secureTrashEntry(trashId);
        Path metadataFile = entry.resolve("metadata.json");
        Path payload = entry.resolve("payload");
        if (!Files.isRegularFile(metadataFile) || !Files.isRegularFile(payload)) {
            throw notFound("STUDIO_TRASH_NOT_FOUND", "Recoverable trash entry not found");
        }
        try {
            TrashMetadata metadata = jsonMapper.readValue(Files.readString(metadataFile), TrashMetadata.class);
            Path target = secureMutationPath(metadata.kind(), metadata.originalPath(), true);
            if (Files.exists(target, java.nio.file.LinkOption.NOFOLLOW_LINKS)) {
                throw conflict("STUDIO_DUPLICATE_PATH", "The original canonical path is already occupied",
                        Map.of("path", metadata.originalPath()));
            }
            moveAtomically(payload, target, false);
            deleteTree(entry);
            audit("restore", metadata.kind(), metadata.originalPath(), metadata.originalEtag(), null);
            return readRequired(metadata.kind(), documentId(metadata.kind(), metadata.originalPath()));
        } catch (WorkspaceException exception) {
            throw exception;
        } catch (Exception exception) {
            throw failure("STUDIO_RESTORE_FAILED", "The trash entry could not be restored", exception);
        }
    }

    public ValidationResult validate(String requestedKind, String documentId, String draft,
            String requestedFormat) {
        String kind = requireKind(requestedKind);
        DocumentSummary current = summaryRequired(kind, documentId);
        return validateSummary(current, draft, requestedFormat);
    }

    public ValidationReport validateScope(String requestedScope, String requestedKind, String documentId,
            String draft, String requestedFormat) {
        String scope = requestedScope == null || requestedScope.isBlank() ? "document" : requestedScope;
        if (!Set.of("document", "dependencies", "workspace").contains(scope)) {
            throw badRequest("STUDIO_INVALID_VALIDATION_SCOPE",
                    "Validation scope must be document, dependencies, or workspace");
        }

        List<DocumentSummary> allDocuments = inventory(null, null, null, true);
        List<DocumentSummary> selected;
        if ("workspace".equals(scope)) {
            selected = allDocuments;
        } else {
            String kind = requireKind(requestedKind);
            DocumentSummary current = allDocuments.stream()
                    .filter(item -> item.kind().equals(kind) && item.id().equals(documentId))
                    .findFirst()
                    .orElseThrow(() -> notFound("STUDIO_DOCUMENT_NOT_FOUND", "Document not found"));
            selected = "document".equals(scope)
                    ? List.of(current)
                    : dependencyClosure(current, allDocuments, draft, requestedFormat);
        }

        List<ValidationDocument> documents = new ArrayList<>();
        for (DocumentSummary summary : selected) {
            boolean isDraft = draft != null && summary.kind().equals(requestedKind)
                    && summary.id().equals(documentId);
            ValidationResult result = validateSummary(summary, isDraft ? draft : null,
                    isDraft ? requestedFormat : null);
            documents.add(new ValidationDocument(summary.id(), summary.kind(), summary.path(), result.etag(),
                    result.valid(), result.diagnostics()));
        }
        List<Diagnostic> diagnostics = documents.stream()
                .flatMap(item -> item.diagnostics().stream()).collect(Collectors.toList());
        boolean valid = diagnostics.stream().noneMatch(item -> "error".equals(item.severity()));
        return new ValidationReport(scope, valid, documents.size(), documents, diagnostics);
    }

    private ValidationResult validateSummary(DocumentSummary current, String draft, String requestedFormat) {
        byte[] bytes = draft == null ? readRequired(current.kind(), current.id()).content()
                .getBytes(StandardCharsets.UTF_8) : checkedContent(draft);
        String format = resolveFormat(current.path(), requestedFormat);
        ParseResult parsed = parse(bytes, format, current.kind());
        String source = new String(bytes, StandardCharsets.UTF_8);
        List<Diagnostic> diagnostics = new ArrayList<>(parsed.diagnostics());
        if ("workflow".equals(current.kind()) && parsed.sourceTree() != null) {
            diagnostics.addAll(workspaceReferenceDiagnostics(current.path(), parsed.sourceTree(), source));
            diagnostics.addAll(dependencyCycleDiagnostics(current.path(), source, parsed));
        }
        boolean valid = parsed.parseStatus().equals("parsed") && diagnostics.stream()
                .noneMatch(item -> "error".equals(item.severity()));
        return new ValidationResult(valid, diagnostics, draft == null ? current.etag() : etag(bytes),
                parsed.compatibility(), parsed.sourceTree());
    }

    private List<DocumentSummary> dependencyClosure(DocumentSummary root, List<DocumentSummary> allDocuments,
            String draft, String requestedFormat) {
        List<DocumentSummary> closure = new ArrayList<>();
        Set<String> included = new HashSet<>();
        List<DocumentSummary> pending = new ArrayList<>(List.of(root));
        List<String> draftCatalogReferences = null;
        List<String> draftSubflowReferences = null;
        if (draft != null && "workflow".equals(root.kind())) {
            String format = resolveFormat(root.path(), requestedFormat);
            ParseResult parsed = parse(checkedContent(draft), format, root.kind());
            if (parsed.sourceTree() != null) {
                draftCatalogReferences = catalogReferences(parsed.sourceTree());
                draftSubflowReferences = subflowReferences(parsed.sourceTree());
            }
        }
        while (!pending.isEmpty()) {
            DocumentSummary current = pending.remove(0);
            if (!included.add(current.id())) continue;
            closure.add(current);
            List<String> catalogReferences = current.id().equals(root.id()) && draftCatalogReferences != null
                    ? draftCatalogReferences : current.catalogReferences();
            List<String> subflowReferences = current.id().equals(root.id()) && draftSubflowReferences != null
                    ? draftSubflowReferences : current.subflowReferences();
            for (DocumentSummary candidate : allDocuments) {
                if (included.contains(candidate.id())) continue;
                boolean referenced = Stream.concat(catalogReferences.stream(), subflowReferences.stream())
                        .anyMatch(reference -> referenceMatchesDocument(reference, candidate));
                if (referenced) pending.add(candidate);
            }
        }
        return closure.stream().sorted(Comparator.comparing(DocumentSummary::kind)
                .thenComparing(DocumentSummary::path)).collect(Collectors.toList());
    }

    private static boolean referenceMatchesDocument(String reference, DocumentSummary candidate) {
        String relative = candidate.path().startsWith(WORKFLOW_PREFIX)
                ? candidate.path().substring(WORKFLOW_PREFIX.length()) : candidate.path();
        return candidate.id().equals(reference) || candidate.workflowId() != null
                && candidate.workflowId().equals(reference)
                || referenceMatches(reference, candidate.path(), relative);
    }

    public SyncStatus syncStatus() {
        List<DocumentSummary> documents = inventory(null, null, null, false);
        List<GeneratedArtifact> artifacts = documents.stream()
                .map(item -> new GeneratedArtifact(item.path(), item.generation().state(), item.etag(), null,
                        item.modifiedAt(), item.generation().message()))
                .collect(Collectors.toList());
        boolean stale = artifacts.stream().anyMatch(item -> "out_of_sync".equals(item.state()));
        return new SyncStatus(stale ? "out_of_sync" : "in_sync", "on-save", null, artifacts);
    }

    private DocumentSummary summaryRequired(String kind, String documentId) {
        return inventory(kind, null, null, true).stream()
                .filter(item -> item.id().equals(documentId)).findFirst()
                .orElseThrow(() -> notFound("STUDIO_DOCUMENT_NOT_FOUND", "Document not found"));
    }

    private Document readRequired(String kind, String documentId) {
        return read(kind, documentId)
                .orElseThrow(() -> notFound("STUDIO_DOCUMENT_NOT_FOUND", "Document not found"));
    }

    private static String requireKind(String kind) {
        if (!"workflow".equals(kind) && !"catalog".equals(kind)) {
            throw badRequest("STUDIO_INVALID_KIND", "Document kind must be workflow or catalog");
        }
        return kind;
    }

    void requireWriteEnabled() {
        if (!writeEnabled) {
            throw forbidden("STUDIO_WRITE_DISABLED",
                    "Studio write operations are disabled; set STUDIO_WRITE_ENABLED=true explicitly");
        }
    }

    private static byte[] checkedContent(String content) {
        if (content == null) throw badRequest("STUDIO_CONTENT_REQUIRED", "Document content is required");
        byte[] bytes = content.getBytes(StandardCharsets.UTF_8);
        if (bytes.length > MAX_DOCUMENT_BYTES) {
            throw badRequest("STUDIO_DOCUMENT_TOO_LARGE", "Document exceeds the 2 MiB Studio limit");
        }
        return bytes;
    }

    private static void requireMatch(DocumentSummary current, String ifMatch) {
        if (ifMatch == null || ifMatch.isBlank()) {
            throw new WorkspaceException(428, "STUDIO_PRECONDITION_REQUIRED",
                    "If-Match is required for document mutations", Map.of("actualEtag", current.etag()));
        }
        if (!etagMatches(ifMatch, current.etag())) {
            throw conflict("STUDIO_REVISION_CONFLICT", "The document changed since it was read",
                    Map.of("expectedEtag", ifMatch, "actualEtag", current.etag(),
                            "currentDocument", current));
        }
    }

    private static boolean etagMatches(String requested, String actual) {
        return "*".equals(requested.trim()) || requested.trim().equals(actual);
    }

    private String normalizeDocumentPath(String kind, String requestedPath) {
        if (requestedPath == null || requestedPath.isBlank()) {
            throw badRequest("STUDIO_PATH_REQUIRED", "A canonical document path is required");
        }
        if (requestedPath.indexOf('\0') >= 0 || requestedPath.contains("\\")
                || requestedPath.matches("(?i).*%[0-9a-f]{2}.*") || requestedPath.startsWith("/")) {
            throw badRequest("STUDIO_INVALID_PATH", "The document path contains an unsafe encoded or absolute segment");
        }
        String path = requestedPath.trim();
        if (path.equals(WORKFLOW_PREFIX.substring(0, WORKFLOW_PREFIX.length() - 1))) {
            throw badRequest("STUDIO_INVALID_PATH", "The workflows directory is not a document");
        }
        if (path.startsWith(WORKFLOW_PREFIX)) path = path.substring(WORKFLOW_PREFIX.length());
        if (path.isBlank() || path.startsWith(".") || path.contains("//")) {
            throw badRequest("STUDIO_INVALID_PATH", "The document path is not a canonical relative path");
        }
        Path relative;
        try {
            relative = Path.of(path).normalize();
        } catch (RuntimeException exception) {
            throw badRequest("STUDIO_INVALID_PATH", "The document path is invalid");
        }
        if (relative.isAbsolute() || relative.startsWith("..") || relative.toString().contains("..")) {
            throw badRequest("STUDIO_INVALID_PATH", "Traversal outside workflows is not allowed");
        }
        String normalized = relative.toString().replace(relative.getFileSystem().getSeparator(), "/");
        if (normalized.startsWith(".studio/") || normalized.equals(".studio") || normalized.startsWith("target/")) {
            throw badRequest("STUDIO_INVALID_PATH", "Generated and Studio metadata paths are not canonical documents");
        }
        resolveFormat(normalized, null, kind);
        return WORKFLOW_PREFIX + normalized;
    }

    private static String resolveFormat(String path, String requestedFormat) {
        String kind = path.startsWith(WORKFLOW_PREFIX + "catalogs/") ? "catalog" : "workflow";
        return resolveFormat(path, requestedFormat, kind);
    }

    private static String resolveFormat(String path, String requestedFormat, String kind) {
        String extension = path.toLowerCase(Locale.ROOT);
        String derived = extension.endsWith(".json") ? "json" : "yaml";
        boolean allowed = "catalog".equals(kind)
                ? extension.endsWith(".yaml") || extension.endsWith(".yml") || extension.endsWith(".json")
                : extension.endsWith(".sw.yaml");
        if (!allowed) {
            throw badRequest("STUDIO_DISALLOWED_EXTENSION", "The document extension is not allowed for " + kind);
        }
        if (requestedFormat != null && !requestedFormat.isBlank()) {
            if (!requestedFormat.equals("yaml") && !requestedFormat.equals("json")) {
                throw badRequest("STUDIO_INVALID_FORMAT", "Document format must be yaml or json");
            }
            if (!requestedFormat.equals(derived)) {
                throw badRequest("STUDIO_FORMAT_MISMATCH", "The format does not match the canonical file extension");
            }
        }
        return derived;
    }

    private Path secureMutationPath(String kind, String path, boolean allowMissing) {
        String normalized = normalizeDocumentPath(kind, path);
        Path root = workspaceRoot.resolve("workflows").normalize();
        if (Files.isSymbolicLink(root)) {
            throw forbidden("STUDIO_SYMLINK_ROOT", "The configured workflows root cannot be a symbolic link");
        }
        try {
            Files.createDirectories(root);
            Path realRoot = root.toRealPath();
            Path relative = Path.of(normalized.substring(WORKFLOW_PREFIX.length()));
            Path candidate = root.resolve(relative).normalize();
            if (!candidate.startsWith(root)) throw badRequest("STUDIO_INVALID_PATH", "Path escapes workflows");
            Path cursor = root;
            for (Path part : relative) {
                cursor = cursor.resolve(part);
                if (Files.isSymbolicLink(cursor)) {
                    throw forbidden("STUDIO_SYMLINK_PATH", "Symbolic links are not allowed in canonical document paths");
                }
                if (Files.exists(cursor, java.nio.file.LinkOption.NOFOLLOW_LINKS) && !Files.isDirectory(cursor)
                        && !cursor.equals(candidate)) {
                    throw badRequest("STUDIO_INVALID_PATH", "A path segment is not a directory");
                }
            }
            Path parent = candidate.getParent();
            if (parent == null || !parent.startsWith(root)) {
                throw badRequest("STUDIO_INVALID_PATH", "Path escapes workflows");
            }
            if (!Files.exists(parent, java.nio.file.LinkOption.NOFOLLOW_LINKS) && allowMissing) {
                Files.createDirectories(parent);
            }
            if (Files.exists(parent, java.nio.file.LinkOption.NOFOLLOW_LINKS)) {
                Path realParent = parent.toRealPath();
                if (!realParent.startsWith(realRoot)) {
                    throw forbidden("STUDIO_ROOT_ESCAPE", "The resolved path escapes the configured workflows root");
                }
                Path requestedParent = root.relativize(parent);
                Path actualParent = realRoot.relativize(realParent);
                if (!requestedParent.equals(actualParent)) {
                    throw forbidden("STUDIO_CASE_BYPASS", "Path case normalization does not match the canonical root");
                }
            }
            if (Files.exists(candidate, java.nio.file.LinkOption.NOFOLLOW_LINKS)
                    && !Files.isRegularFile(candidate, java.nio.file.LinkOption.NOFOLLOW_LINKS)) {
                throw badRequest("STUDIO_INVALID_PATH", "The canonical document is not a regular file");
            }
            if (Files.exists(candidate, java.nio.file.LinkOption.NOFOLLOW_LINKS)) {
                Path actual = candidate.toRealPath();
                if (!actual.startsWith(realRoot) || !realRoot.relativize(actual).equals(relative)) {
                    throw forbidden("STUDIO_CASE_BYPASS", "The resolved document path is not canonical");
                }
            } else if (!allowMissing) {
                throw notFound("STUDIO_DOCUMENT_NOT_FOUND", "Document not found");
            }
            return candidate;
        } catch (WorkspaceException exception) {
            throw exception;
        } catch (IOException exception) {
            throw failure("STUDIO_PATH_CHECK_FAILED", "The canonical path could not be verified", exception);
        }
    }

    private Path secureTrashEntry(String trashId) {
        Path trashRoot = workspaceRoot.resolve(".studio/trash").normalize();
        if (Files.isSymbolicLink(workspaceRoot.resolve(".studio")) || Files.isSymbolicLink(trashRoot)) {
            throw forbidden("STUDIO_SYMLINK_TRASH", "The Studio trash path cannot be a symbolic link");
        }
        try {
            Files.createDirectories(trashRoot);
            Path root = trashRoot.toRealPath();
            Path entry = trashRoot.resolve(trashId).normalize();
            if (!entry.startsWith(trashRoot) || Files.isSymbolicLink(entry)) {
                throw forbidden("STUDIO_INVALID_TRASH_PATH", "The trash path is unsafe");
            }
            if (Files.exists(entry)) {
                Path actual = entry.toRealPath();
                if (!actual.startsWith(root) || !root.relativize(actual).equals(Path.of(trashId))) {
                    throw forbidden("STUDIO_CASE_BYPASS", "The trash path is not canonical");
                }
            }
            return entry;
        } catch (WorkspaceException exception) {
            throw exception;
        } catch (IOException exception) {
            throw failure("STUDIO_TRASH_PATH_FAILED", "The recoverable trash path could not be verified", exception);
        }
    }

    private static void atomicWrite(Path target, byte[] bytes, Path existing) throws IOException {
        Path parent = target.getParent();
        Files.createDirectories(parent);
        Set<PosixFilePermission> permissions = null;
        if (existing != null && Files.exists(existing, java.nio.file.LinkOption.NOFOLLOW_LINKS)) {
            try {
                permissions = Files.getPosixFilePermissions(existing, java.nio.file.LinkOption.NOFOLLOW_LINKS);
            } catch (UnsupportedOperationException ignored) {
                // The filesystem does not expose POSIX permissions.
            }
        }
        Path temporary = Files.createTempFile(parent, ".studio-write-", ".tmp");
        try {
            Files.write(temporary, bytes);
            if (permissions != null) Files.setPosixFilePermissions(temporary, permissions);
            moveAtomically(temporary, target, true);
        } finally {
            Files.deleteIfExists(temporary);
        }
    }

    private static void moveAtomically(Path source, Path target, boolean replace) throws IOException {
        try {
            if (replace) Files.move(source, target, java.nio.file.StandardCopyOption.ATOMIC_MOVE,
                    java.nio.file.StandardCopyOption.REPLACE_EXISTING);
            else Files.move(source, target, java.nio.file.StandardCopyOption.ATOMIC_MOVE);
        } catch (AtomicMoveNotSupportedException exception) {
            if (replace) Files.move(source, target, java.nio.file.StandardCopyOption.REPLACE_EXISTING);
            else Files.move(source, target);
        }
    }

    private static void deleteTree(Path root) throws IOException {
        if (!Files.exists(root)) return;
        Files.walkFileTree(root, new SimpleFileVisitor<>() {
            @Override public FileVisitResult visitFile(Path file, BasicFileAttributes attrs) throws IOException {
                Files.deleteIfExists(file);
                return FileVisitResult.CONTINUE;
            }
            @Override public FileVisitResult postVisitDirectory(Path dir, IOException exception) throws IOException {
                if (exception != null) throw exception;
                Files.deleteIfExists(dir);
                return FileVisitResult.CONTINUE;
            }
        });
    }

    private List<Diagnostic> dependencyCycleDiagnostics(String currentPath, String source,
            ParseResult current) {
        if (current.sourceTree() == null || !"parsed".equals(current.parseStatus())) return List.of();
        Map<String, DependencyNode> nodes = new LinkedHashMap<>();
        for (DocumentSummary candidate : inventory("workflow", null, null, false)) {
            ParseResult parsed;
            if (candidate.path().equals(currentPath)) {
                parsed = current;
            } else {
                Document document = readRequired("workflow", candidate.id());
                parsed = parse(document.content().getBytes(StandardCharsets.UTF_8), document.format(), "workflow");
            }
            if (parsed.sourceTree() == null || !"parsed".equals(parsed.parseStatus())) continue;
            nodes.put(candidate.path(), new DependencyNode(
                    candidate.path(), relativeWorkflowPath(candidate.path()), text(parsed.sourceTree(), "id"),
                    subflowReferences(parsed.sourceTree())));
        }
        if (!nodes.containsKey(currentPath)) {
            nodes.put(currentPath, new DependencyNode(currentPath, relativeWorkflowPath(currentPath),
                    text(current.sourceTree(), "id"), subflowReferences(current.sourceTree())));
        }
        Map<String, Set<String>> edges = new LinkedHashMap<>();
        for (DependencyNode node : nodes.values()) {
            Set<String> targets = new LinkedHashSet<>();
            for (String reference : node.references()) {
                nodes.values().stream()
                        .filter(candidate -> subflowReferenceMatches(reference, candidate))
                        .map(DependencyNode::path)
                        .findFirst()
                        .ifPresent(targets::add);
            }
            edges.put(node.path(), targets);
        }
        Set<String> cycleTargets = new LinkedHashSet<>();
        for (String target : edges.getOrDefault(currentPath, Set.of())) {
            if (target.equals(currentPath) || reaches(target, currentPath, edges, new HashSet<>())) {
                cycleTargets.add(target);
            }
        }
        if (cycleTargets.isEmpty()) return List.of();
        String cycle = currentPath + " -> " + String.join(" -> ", cycleTargets) + " -> " + currentPath;
        return List.of(Diagnostic.error("studio.workflow.subflow-cycle", "semantic",
                "Subflow dependency cycle detected: " + cycle,
                rangeForField(source, "subFlowRef"),
                "Break the direct or indirect subflow reference cycle before saving.", WORKFLOW_PROFILE));
    }

    private List<Diagnostic> workspaceReferenceDiagnostics(String currentPath, JsonNode root,
            String source) {
        List<Diagnostic> diagnostics = new ArrayList<>();
        String workflowId = text(root, "id");
        if (workflowId != null && findWorkflowPathsById(workflowId).stream()
                .anyMatch(path -> !path.equals(currentPath))) {
            diagnostics.add(Diagnostic.error("studio.workflow.duplicate-id", "semantic",
                    "Workflow ID is already used by another workspace document: " + workflowId,
                    rangeForText(source, workflowId),
                    "Assign a unique workflow ID before saving or deploying this document.", WORKFLOW_PROFILE));
        }
        Map<String, String> aliases = declaredCatalogAliasTargets(root);
        JsonNode functions = root.path("functions");
        if (functions.isArray()) {
            functions.forEach(function -> {
                String operation = text(function, "operation");
                if (operation == null) return;
                int separator = operation.indexOf('#');
                if (separator <= 0 || separator == operation.length() - 1) return;
                String alias = operation.substring(0, separator);
                String operationId = operation.substring(separator + 1);
                String reference = aliases.get(alias);
                if (reference == null) return;
                Path catalogPath = workspaceReferencePath(reference);
                if (catalogPath == null || !Files.isRegularFile(catalogPath)) {
                    diagnostics.add(Diagnostic.error("studio.workflow.catalog-unresolved", "semantic",
                            "Catalog target cannot be resolved for alias " + alias + ": " + reference,
                            rangeForText(source, reference),
                            "Repair the workflow-uri-definitions target or add the catalog file.", WORKFLOW_PROFILE));
                    return;
                }
                try {
                    String catalogFormat = catalogPath.getFileName().toString().toLowerCase(Locale.ROOT).endsWith(".json")
                            ? "json" : "yaml";
                    ParseResult catalog = parse(Files.readAllBytes(catalogPath), catalogFormat, "catalog");
                    if (catalog.sourceTree() != null && !catalogOperationIds(catalog.sourceTree()).containsValue(operationId)) {
                        diagnostics.add(Diagnostic.error("studio.workflow.operation-unresolved", "semantic",
                                "Catalog operation cannot be resolved: " + operation,
                                rangeForText(source, operation),
                                "Add the operationId to the target catalog or repair the function operation.", WORKFLOW_PROFILE));
                    }
                } catch (IOException ignored) {
                    diagnostics.add(Diagnostic.error("studio.workflow.catalog-unresolved", "semantic",
                            "Catalog target could not be read for alias " + alias + ": " + reference,
                            rangeForText(source, reference),
                            "Repair the catalog path and verify workspace read access.", WORKFLOW_PROFILE));
                }
            });
        }
        for (String reference : subflowReferences(root)) {
            if (findWorkflowReference(reference).isEmpty()) {
                diagnostics.add(Diagnostic.error("studio.workflow.subflow-unresolved", "semantic",
                        "Subflow target cannot be resolved: " + reference,
                        rangeForText(source, reference),
                        "Choose an existing workflow ID or workspace-relative subflow path.", WORKFLOW_PROFILE));
            }
        }
        return diagnostics;
    }

    private Map<String, String> declaredCatalogAliasTargets(JsonNode root) {
        Map<String, String> aliases = new LinkedHashMap<>();
        JsonNode extensions = root.path("extensions");
        if (!extensions.isArray()) return aliases;
        extensions.forEach(extension -> {
            JsonNode definitions = extension.path("definitions");
            if (definitions.isObject()) definitions.fields().forEachRemaining(entry -> {
                if (entry.getValue().isTextual()) {
                    String value = entry.getValue().asText();
                    int classpath = value.indexOf("classpath:/");
                    aliases.put(entry.getKey(), classpath >= 0
                            ? value.substring(classpath + "classpath:/".length()) : value);
                }
            });
        });
        return aliases;
    }

    private Path workspaceReferencePath(String reference) {
        String normalized = reference == null ? "" : reference.trim();
        if (normalized.startsWith("workflows/")) normalized = normalized.substring(WORKFLOW_PREFIX.length());
        if (normalized.startsWith("classpath:/")) normalized = normalized.substring("classpath:/".length());
        Path path = workspaceRoot.resolve(WORKFLOW_PREFIX).resolve(normalized).normalize();
        return path.startsWith(workspaceRoot.resolve(WORKFLOW_PREFIX).normalize()) ? path : null;
    }

    private Optional<Path> findWorkflowReference(String reference) {
        Path workflows = workspaceRoot.resolve(WORKFLOW_PREFIX).normalize();
        if (!Files.isDirectory(workflows)) return Optional.empty();
        try (var paths = Files.walk(workflows)) {
            return paths.filter(Files::isRegularFile)
                    .filter(path -> path.getFileName().toString().endsWith(".sw.yaml"))
                    .filter(path -> workflowReferenceMatches(path, reference))
                    .findFirst();
        } catch (IOException ignored) {
            return Optional.empty();
        }
    }

    private List<String> findWorkflowPathsById(String workflowId) {
        Path workflows = workspaceRoot.resolve(WORKFLOW_PREFIX).normalize();
        if (!Files.isDirectory(workflows)) return List.of();
        try (var paths = Files.walk(workflows)) {
            return paths.filter(Files::isRegularFile)
                    .filter(path -> path.getFileName().toString().endsWith(".sw.yaml"))
                    .filter(path -> workflowId.equals(workflowId(path)))
                    .map(path -> workspaceRoot.relativize(path).toString()
                            .replace(path.getFileSystem().getSeparator(), "/"))
                    .toList();
        } catch (IOException ignored) {
            return List.of();
        }
    }

    private String workflowId(Path path) {
        try {
            ParseResult parsed = parse(Files.readAllBytes(path), "yaml", "workflow");
            return parsed.sourceTree() == null ? null : text(parsed.sourceTree(), "id");
        } catch (IOException ignored) {
            return null;
        }
    }

    private boolean workflowReferenceMatches(Path path, String reference) {
        try {
            String relative = workspaceRoot.relativize(path).toString().replace(path.getFileSystem().getSeparator(), "/");
            String workspaceRelative = relative.startsWith(WORKFLOW_PREFIX)
                    ? relative.substring(WORKFLOW_PREFIX.length()) : relative;
            ParseResult parsed = parse(Files.readAllBytes(path), "yaml", "workflow");
            String id = parsed.sourceTree() == null ? null : text(parsed.sourceTree(), "id");
            return reference.equals(id) || reference.equals(relative) || reference.equals(workspaceRelative)
                    || path.getFileName().toString().equals(reference);
        } catch (IOException ignored) {
            return false;
        }
    }

    private static boolean subflowReferenceMatches(String reference, DependencyNode candidate) {
        return reference != null && (reference.equals(candidate.workflowId())
                || referenceMatches(reference, candidate.path(), candidate.relativePath()));
    }

    private static boolean reaches(String start, String target, Map<String, Set<String>> edges,
            Set<String> visited) {
        if (!visited.add(start)) return false;
        for (String next : edges.getOrDefault(start, Set.of())) {
            if (next.equals(target) || reaches(next, target, edges, visited)) return true;
        }
        return false;
    }

    private record DependencyNode(String path, String relativePath, String workflowId,
            List<String> references) {}

    private List<Reference> referencesTo(DocumentSummary target) {
        String relative = target.path().substring(WORKFLOW_PREFIX.length());
        List<Reference> references = new ArrayList<>();
        for (DocumentSummary candidate : inventory(null, null, null, false)) {
            if (candidate.id().equals(target.id())) continue;
            boolean matches = candidate.catalogReferences().stream()
                    .anyMatch(reference -> referenceMatches(reference, target.path(), relative))
                    || candidate.subflowReferences().stream()
                    .anyMatch(reference -> referenceMatches(reference, target.path(), relative));
            if (matches) references.add(new Reference(candidate.id(), candidate.path()));
        }
        return references;
    }

    private static boolean referenceMatches(String reference, String fullPath, String relativePath) {
        if (reference == null) return false;
        String normalized = reference.replace("classpath:/", "").replace("\\", "/");
        return normalized.equals(fullPath) || normalized.equals(relativePath)
                || normalized.endsWith("/" + relativePath);
    }

    private static void audit(String action, String kind, String path, String etag, String previousEtag) {
        LOG.infof("studio.audit action=%s kind=%s path=%s etag=%s previousEtag=%s",
                action, kind, path, etag, previousEtag == null ? "-" : previousEtag);
    }

    private static WorkspaceException badRequest(String code, String detail) {
        return new WorkspaceException(400, code, detail, Map.of());
    }

    private static WorkspaceException notFound(String code, String detail) {
        return new WorkspaceException(404, code, detail, Map.of());
    }

    private static WorkspaceException forbidden(String code, String detail) {
        return new WorkspaceException(403, code, detail, Map.of());
    }

    private static WorkspaceException conflict(String code, String detail, Map<String, ?> details) {
        return new WorkspaceException(409, code, detail, details);
    }

    private static WorkspaceException failure(String code, String detail, Exception cause) {
        return new WorkspaceException(500, code, detail, Map.of("cause", cause.getClass().getSimpleName()));
    }

    private List<DocumentSummary> inventory(String requestedKind, String prefix, String query,
            boolean includeDiagnostics) {
        Path canonical = workspaceRoot.resolve("workflows").normalize();
        if (!Files.isDirectory(canonical)) {
            return List.of();
        }
        List<DocumentSummary> documents = new ArrayList<>();
        try {
            Files.walkFileTree(canonical, new SimpleFileVisitor<>() {
                @Override
                public FileVisitResult visitFile(Path file, BasicFileAttributes attributes) {
                    if (attributes.isRegularFile() && isCanonicalDocument(file, canonical)) {
                        DocumentSummary summary = readSummary(file, canonical, includeDiagnostics);
                        if (matches(summary, requestedKind, prefix, query)) {
                            documents.add(summary);
                        }
                    }
                    return FileVisitResult.CONTINUE;
                }

                @Override
                public FileVisitResult visitFileFailed(Path file, IOException exception) {
                    // A single unreadable file remains visible as an inventory diagnostic when
                    // possible; directory traversal never escapes the configured root.
                    return FileVisitResult.CONTINUE;
                }
            });
        } catch (IOException ignored) {
            // The list remains a safe, possibly partial read-only view.
        }
        return documents.stream()
                .sorted(Comparator.comparing(DocumentSummary::kind).thenComparing(DocumentSummary::path))
                .collect(Collectors.toList());
    }

    private DocumentSummary readSummary(Path file, Path canonical, boolean includeDiagnostics) {
        String relative = canonical.relativize(file).toString().replace(file.getFileSystem().getSeparator(), "/");
        String path = WORKFLOW_PREFIX + relative;
        String kind = relative.startsWith("catalogs/") ? "catalog" : "workflow";
        String format = file.getFileName().toString().toLowerCase(Locale.ROOT).endsWith(".json") ? "json" : "yaml";
        byte[] bytes;
        Instant modifiedAt;
        try {
            bytes = Files.readAllBytes(file);
            modifiedAt = Files.getLastModifiedTime(file).toInstant();
        } catch (IOException exception) {
            return unavailableSummary(kind, path, format, exception.getMessage(), includeDiagnostics);
        }
        if (bytes.length > MAX_DOCUMENT_BYTES) {
            return unavailableSummary(kind, path, format, "Document exceeds the 2 MiB Studio limit", includeDiagnostics,
                    bytes.length, modifiedAt, etag(bytes));
        }

        ParseResult parsed = parse(bytes, format, kind);
        GenerationStatus generation = generationStatus(path, bytes);
        List<Diagnostic> diagnostics = includeDiagnostics ? new ArrayList<>(parsed.diagnostics()) : List.of();
        if (includeDiagnostics && "workflow".equals(kind) && parsed.sourceTree() != null) {
            diagnostics.addAll(workspaceReferenceDiagnostics(path, parsed.sourceTree(),
                    new String(bytes, StandardCharsets.UTF_8)));
        }
        return new DocumentSummary(
                documentId(kind, path), kind, path, displayName(file.getFileName().toString()), format,
                bytes.length, etag(bytes), 1, modifiedAt, parsed.compatibility(), parsed.specVersion(),
                parsed.openapi(), generation, diagnostics, parsed.documentVersion(), parsed.name(),
                parsed.metadata() == null ? null : parsed.metadata().workflowId(),
                parsed.stateTypes(), parsed.catalogAliases(), parsed.functionReferences(), parsed.catalogReferences(),
                parsed.subflowReferences(), parsed.parseStatus(), parsed.validationState(),
                reusableSubflow(relative, parsed.sourceTree()));
    }

    private DocumentSummary unavailableSummary(String kind, String path, String format, String message,
            boolean includeDiagnostics) {
        return unavailableSummary(kind, path, format, message, includeDiagnostics, 0, Instant.EPOCH, "\"sha256:unavailable\"");
    }

    private DocumentSummary unavailableSummary(String kind, String path, String format, String message,
            boolean includeDiagnostics, long size, Instant modifiedAt, String hash) {
        List<Diagnostic> diagnostics = includeDiagnostics
                ? List.of(Diagnostic.error("studio-read", "parse", message)) : List.of();
        return new DocumentSummary(
                documentId(kind, path), kind, path, displayName(Path.of(path).getFileName().toString()), format,
                size, hash, 1, modifiedAt, "source-readonly", null, null,
                new GenerationStatus("out_of_sync", null, null, "Source could not be read"), diagnostics,
                null, null, null, Set.of(), Set.of(), List.of(), List.of(), List.of(), "error", "parse-error", false);
    }

    private ParseResult parse(byte[] bytes, String format, String kind) {
        String source = new String(bytes, StandardCharsets.UTF_8);
        try {
            JsonNode root = ("json".equals(format) ? jsonMapper : yamlMapper)
                    .readTree(source);
            if (root == null || !root.isObject()) {
                return ParseResult.error("Document root must be an object", kind,
                        range(source, 0, Math.max(1, source.length())));
            }
            String specVersion = text(root, "specVersion");
            String openapi = text(root, "openapi");
            String documentVersion = "catalog".equals(kind)
                    ? text(root.path("info"), "version") : text(root, "version");
            String name = "catalog".equals(kind)
                    ? text(root.path("info"), "title") : text(root, "name");
            String compatibility = supported(kind, specVersion, openapi) ? "editable" : "source-readonly";
            String validationState = supported(kind, specVersion, openapi) ? "valid" : "unsupported";
            List<Diagnostic> diagnostics = validate(root, kind, source, specVersion, openapi);
            return new ParseResult(specVersion, openapi, documentVersion, name, compatibility,
                    stateTypes(root), catalogAliases(root), functionReferences(root), catalogReferences(root),
                    subflowReferences(root), "parsed", validationState, diagnostics,
                    metadata(root, kind, specVersion, openapi, documentVersion, name), root);
        } catch (JsonProcessingException exception) {
            return ParseResult.error("Unable to parse document: " + safeMessage(exception), kind,
                    rangeAtLocation(source, exception.getLocation()));
        } catch (IllegalArgumentException exception) {
            return ParseResult.error("Unable to parse document: " + safeMessage(exception), kind,
                    range(source, 0, Math.max(1, source.length())));
        }
    }

    private static List<Diagnostic> validate(JsonNode root, String kind, String source,
            String specVersion, String openapi) {
        List<Diagnostic> diagnostics = new ArrayList<>();
        if ("catalog".equals(kind)) {
            if (openapi == null) {
                diagnostics.add(required(source, "openapi", "OpenAPI catalog documents must declare an openapi version"));
            } else if (!openapi.startsWith("3.")) {
                diagnostics.add(Diagnostic.warning("studio.openapi.version", "compatibility",
                        "This OpenAPI version is outside the pinned local catalog profile", rangeForField(source, "openapi"),
                        "Open the source and migrate the catalog to OpenAPI 3.x before editing.", CATALOG_PROFILE));
            }
            validateCatalog(root, source, diagnostics);
        } else {
            if (specVersion == null) {
                diagnostics.add(required(source, "specVersion", "Workflow documents must declare specVersion"));
            } else if (!"0.8".equals(specVersion)) {
                diagnostics.add(Diagnostic.warning("studio.workflow.version", "compatibility",
                        "This workflow version is outside the pinned local workflow profile", rangeForField(source, "specVersion"),
                        "Open the source and migrate the workflow to specVersion 0.8 before editing.", WORKFLOW_PROFILE));
            }
            validateWorkflow(root, source, diagnostics);
        }
        return diagnostics;
    }

    private static void validateWorkflow(JsonNode root, String source, List<Diagnostic> diagnostics) {
        for (String field : List.of("id", "name", "start", "states")) {
            String value = text(root, field);
            if (!root.has(field)) {
                diagnostics.add(required(source, field, "Workflow is missing the required field '" + field + "'"));
            } else if (Set.of("id", "name", "start").contains(field) && (value == null || value.isBlank())) {
                diagnostics.add(Diagnostic.error("studio.workflow.blank-" + field, "semantic",
                        "Workflow field '" + field + "' must not be blank", rangeForField(source, field),
                        "Enter a non-empty " + field + " value.", WORKFLOW_PROFILE));
            }
        }
        validateExpressionShape(root, source, diagnostics);
        JsonNode states = root.path("states");
        if (!states.isArray()) return;
        Set<String> stateNames = new LinkedHashSet<>();
        Map<String, JsonNode> stateByName = new LinkedHashMap<>();
        for (JsonNode state : states) {
            String name = text(state, "name");
            if (name == null) {
                diagnostics.add(Diagnostic.error("studio.workflow.state-name", "schema",
                        "Each workflow state must have a name", rangeForField(source, "states"),
                        "Add a unique name to the state.", WORKFLOW_PROFILE));
            } else if (!stateNames.add(name)) {
                diagnostics.add(Diagnostic.error("studio.workflow.duplicate-state", "semantic",
                        "Workflow state names must be unique: " + name, rangeForText(source, name),
                        "Rename one of the duplicate states.", WORKFLOW_PROFILE));
            } else {
                stateByName.put(name, state);
            }
            if (text(state, "type") == null) {
                diagnostics.add(Diagnostic.error("studio.workflow.state-type", "schema",
                        "Each workflow state must declare a type", rangeForText(source, name == null ? "states" : name),
                        "Add a supported state type such as switch, operation, callback, or end.", WORKFLOW_PROFILE));
            }
        }
        String start = text(root, "start");
        if (start != null && !stateNames.isEmpty() && !stateNames.contains(start)) {
            diagnostics.add(Diagnostic.error("studio.workflow.start-reference", "semantic",
                    "The workflow start state does not exist: " + start, rangeForField(source, "start"),
                    "Change start to the name of a state in the states list.", WORKFLOW_PROFILE));
        }
        collectTransitions(root, source, stateNames, diagnostics);
        validateWorkflowGraph(root, source, stateNames, stateByName, diagnostics);
        validateWorkflowReferences(root, source, diagnostics);
        validateWorkflowExtensions(root, source, diagnostics);
    }

    private static void validateWorkflowGraph(JsonNode root, String source, Set<String> stateNames,
            Map<String, JsonNode> stateByName, List<Diagnostic> diagnostics) {
        Map<String, Set<String>> outgoing = new LinkedHashMap<>();
        for (Map.Entry<String, JsonNode> entry : stateByName.entrySet()) {
            String name = entry.getKey();
            JsonNode state = entry.getValue();
            Set<String> targets = new LinkedHashSet<>();
            Set<String> exceptionalTargets = new LinkedHashSet<>();
            addTransitionTarget(state, "transition", targets);
            addTransitionTargets(state.path("dataConditions"), targets);
            addTransitionTargets(state.path("eventConditions"), targets);
            addTransitionTargets(state.path("onErrors"), exceptionalTargets);
            addTransitionTargets(state.path("onEvents"), exceptionalTargets);
            addTransitionTarget(state.path("defaultCondition"), "transition", targets);
            Set<String> allTargets = new LinkedHashSet<>(targets);
            allTargets.addAll(exceptionalTargets);
            outgoing.put(name, allTargets);

            for (String target : allTargets) {
                if (name.equals(target)) {
                    diagnostics.add(Diagnostic.error("studio.workflow.self-loop", "semantic",
                            "State transitions to itself: " + name, rangeForText(source, name),
                            "Change the transition target or add an explicit bounded loop construct.", WORKFLOW_PROFILE));
                }
            }
            boolean terminal = terminalState(state);
            if (terminal && !targets.isEmpty()) {
                diagnostics.add(Diagnostic.error("studio.workflow.terminal-transition", "semantic",
                        "Terminal state must not also declare an outgoing transition: " + name,
                        rangeForText(source, name),
                        "Remove the transition or remove the terminal end definition.", WORKFLOW_PROFILE));
            } else if (!terminal && targets.isEmpty() && exceptionalTargets.isEmpty()) {
                diagnostics.add(Diagnostic.error("studio.workflow.dead-end", "semantic",
                        "State has no transition and is not terminal: " + name, rangeForText(source, name),
                        "Add a transition to the next state or mark this state with end: true.", WORKFLOW_PROFILE));
            }
            validateSwitchCoverage(state, name, source, diagnostics);
            validateCallbackCorrelation(state, name, source, diagnostics);
        }

        String start = text(root, "start");
        if (start == null || !stateNames.contains(start)) return;
        Set<String> reachable = new LinkedHashSet<>();
        ArrayList<String> pending = new ArrayList<>();
        pending.add(start);
        while (!pending.isEmpty()) {
            String current = pending.remove(pending.size() - 1);
            if (!reachable.add(current)) continue;
            pending.addAll(outgoing.getOrDefault(current, Set.of()));
        }
        for (String name : stateNames) {
            if (!reachable.contains(name)) {
                diagnostics.add(Diagnostic.warning("studio.workflow.unreachable-state", "semantic",
                        "State is unreachable from workflow start: " + name, rangeForText(source, name),
                        "Connect the state from the start path or remove it.", WORKFLOW_PROFILE));
            }
        }
    }

    private static void addTransitionTarget(JsonNode node, String field, Set<String> targets) {
        String target = text(node, field);
        if (target != null && !target.isBlank()) targets.add(target);
    }

    private static void addTransitionTargets(JsonNode node, Set<String> targets) {
        if (node == null || node.isMissingNode() || node.isNull()) return;
        if (node.isArray()) {
            node.forEach(child -> addTransitionTarget(child, "transition", targets));
        } else if (node.isObject()) {
            addTransitionTarget(node, "transition", targets);
        }
    }

    private static boolean terminalState(JsonNode state) {
        JsonNode end = state.get("end");
        return end != null && ((end.isBoolean() && end.asBoolean()) || end.isObject());
    }

    private static void validateSwitchCoverage(JsonNode state, String name, String source,
            List<Diagnostic> diagnostics) {
        if (!"switch".equals(text(state, "type"))) return;
        JsonNode conditions = state.path("dataConditions");
        if (!conditions.isArray() || conditions.isEmpty()) conditions = state.path("eventConditions");
        if (!conditions.isArray() || conditions.isEmpty()) {
            diagnostics.add(Diagnostic.error("studio.workflow.switch-conditions", "semantic",
                    "Switch state has no conditions: " + name, rangeForText(source, name),
                    "Add dataConditions or eventConditions to define the switch branches.", WORKFLOW_PROFILE));
            return;
        }
        Set<String> seen = new HashSet<>();
        for (int index = 0; index < conditions.size(); index++) {
            JsonNode condition = conditions.get(index);
            String expression = text(condition, "condition");
            if (expression != null && !seen.add(expression)) {
                diagnostics.add(Diagnostic.warning("studio.workflow.duplicate-condition", "semantic",
                        "Switch contains a duplicate condition that may make a branch unreachable: " + name,
                        rangeForText(source, expression),
                        "Remove the duplicate condition or make its expression distinct.", WORKFLOW_PROFILE));
            }
            if (expression != null && index < conditions.size() - 1
                    && expression.replaceAll("\\s+", "").matches("\\$\\{?true\\}?")) {
                diagnostics.add(Diagnostic.warning("studio.workflow.unreachable-branch", "semantic",
                        "A switch branch is always true, so later branches are unreachable: " + name,
                        rangeForText(source, expression),
                        "Move the unconditional branch last or remove later conditions.", WORKFLOW_PROFILE));
                break;
            }
        }
        JsonNode defaultCondition = state.path("defaultCondition");
        if (!defaultCondition.isObject() || text(defaultCondition, "transition") == null) {
            diagnostics.add(Diagnostic.warning("studio.workflow.switch-default", "semantic",
                    "Switch has no default transition: " + name, rangeForText(source, name),
                    "Add defaultCondition so unmatched input has an explicit outcome.", WORKFLOW_PROFILE));
        }
    }

    private static void validateCallbackCorrelation(JsonNode state, String name, String source,
            List<Diagnostic> diagnostics) {
        if (!"callback".equals(text(state, "type"))) return;
        String eventRef = text(state, "eventRef");
        if (eventRef == null || eventRef.isBlank()) {
            diagnostics.add(Diagnostic.error("studio.workflow.callback-event-correlation", "semantic",
                    "Callback state must declare eventRef: " + name, rangeForText(source, name),
                    "Declare the event used to correlate the callback completion.", WORKFLOW_PROFILE));
        }
        boolean hasAction = state.has("action") || (state.path("actions").isArray() && !state.path("actions").isEmpty());
        if (!hasAction) {
            diagnostics.add(Diagnostic.error("studio.workflow.callback-action", "semantic",
                    "Callback state must declare an action: " + name, rangeForText(source, name),
                    "Add action or actions with the callback request operation.", WORKFLOW_PROFILE));
        }
    }

    private static void validateWorkflowReferences(JsonNode root, String source,
            List<Diagnostic> diagnostics) {
        Set<String> functions = definitionNames(root.path("functions"));
        Set<String> events = definitionNames(root.path("events"));
        Set<String> errors = definitionNames(root.path("errors"));
        Set<String> aliases = declaredCatalogAliases(root);
        validateReferenceTree(root, root, source, functions, events, errors, aliases, diagnostics);
        JsonNode functionDefinitions = root.path("functions");
        if (functionDefinitions.isArray()) {
            for (JsonNode function : functionDefinitions) {
                String operation = text(function, "operation");
                if (operation == null || operation.isBlank()) {
                    diagnostics.add(Diagnostic.error("studio.workflow.function-operation", "semantic",
                            "Workflow function must declare a catalog operation", rangeForText(source, "functions"),
                            "Use the form catalogAlias#operationId.", WORKFLOW_PROFILE));
                    continue;
                }
                int separator = operation.indexOf('#');
                if (separator <= 0 || separator == operation.length() - 1) {
                    diagnostics.add(Diagnostic.error("studio.workflow.operation-reference", "semantic",
                            "Function operation must use catalogAlias#operationId: " + operation,
                            rangeForText(source, operation),
                            "Use a non-empty catalog alias and operation ID separated by '#'.", WORKFLOW_PROFILE));
                } else if (!aliases.contains(operation.substring(0, separator))) {
                    diagnostics.add(Diagnostic.error("studio.workflow.catalog-alias", "semantic",
                            "Function references an undefined catalog alias: " + operation.substring(0, separator),
                            rangeForText(source, operation),
                            "Declare the alias in workflow-uri-definitions or repair the function operation.", WORKFLOW_PROFILE));
                }
            }
        }
    }

    private static Set<String> definitionNames(JsonNode definitions) {
        Set<String> names = new LinkedHashSet<>();
        if (!definitions.isArray()) return names;
        definitions.forEach(item -> {
            String name = text(item, "name");
            if (name != null && !name.isBlank()) names.add(name);
        });
        return names;
    }

    private static Set<String> declaredCatalogAliases(JsonNode root) {
        Set<String> aliases = new LinkedHashSet<>();
        JsonNode extensions = root.path("extensions");
        if (!extensions.isArray()) return aliases;
        extensions.forEach(extension -> {
            JsonNode definitions = extension.path("definitions");
            if (definitions.isObject()) definitions.fieldNames().forEachRemaining(aliases::add);
        });
        return aliases;
    }

    private static void validateReferenceTree(JsonNode node, JsonNode root, String source,
            Set<String> functions, Set<String> events, Set<String> errors, Set<String> aliases,
            List<Diagnostic> diagnostics) {
        if (node.isObject()) {
            node.fields().forEachRemaining(entry -> {
                String key = entry.getKey();
                JsonNode value = entry.getValue();
                if ("functionRef".equals(key)) {
                    String refName = text(value, "refName");
                    if (refName == null || refName.isBlank()) {
                        diagnostics.add(Diagnostic.error("studio.workflow.function-reference", "semantic",
                                "functionRef must declare refName", rangeForText(source, key),
                                "Point functionRef.refName at a declared workflow function.", WORKFLOW_PROFILE));
                    } else if (!functions.contains(refName)) {
                        diagnostics.add(Diagnostic.error("studio.workflow.unresolved-function", "semantic",
                                "Workflow references an undefined function: " + refName, rangeForText(source, refName),
                                "Declare the function or repair the functionRef.", WORKFLOW_PROFILE));
                    }
                }
                if ("eventRef".equals(key)) {
                    String ref = value.isValueNode() ? value.asText() : null;
                    if (ref == null || ref.isBlank()) {
                        diagnostics.add(Diagnostic.error("studio.workflow.event-reference", "semantic",
                                "eventRef must not be blank", rangeForText(source, key),
                                "Point eventRef at a declared workflow event.", WORKFLOW_PROFILE));
                    } else if (!events.contains(ref)) {
                        diagnostics.add(Diagnostic.error("studio.workflow.unresolved-event", "semantic",
                                "Workflow references an undefined event: " + ref, rangeForText(source, ref),
                                "Declare the event or repair the eventRef.", WORKFLOW_PROFILE));
                    }
                }
                if ("errorRef".equals(key)) validateErrorReference(value, source, errors, diagnostics);
                if ("errorRefs".equals(key) && value.isArray()) value.forEach(item -> validateErrorReference(item, source, errors, diagnostics));
                if ("subFlowRef".equals(key) || "subflowRef".equals(key)) {
                    String ref = value.isValueNode() ? value.asText() : null;
                    String workflowId = text(root, "id");
                    if (ref == null || ref.isBlank()) {
                        diagnostics.add(Diagnostic.error("studio.workflow.subflow-reference", "semantic",
                                "subFlowRef must not be blank", rangeForText(source, key),
                                "Point subFlowRef at a reusable subflow ID or path.", WORKFLOW_PROFILE));
                    } else if (ref.equals(workflowId)) {
                        diagnostics.add(Diagnostic.error("studio.workflow.subflow-self-reference", "semantic",
                                "Workflow cannot invoke itself as a subflow: " + ref, rangeForText(source, ref),
                                "Choose a different subflow target.", WORKFLOW_PROFILE));
                    }
                }
                validateReferenceTree(value, root, source, functions, events, errors, aliases, diagnostics);
            });
        } else if (node.isArray()) node.forEach(child ->
                validateReferenceTree(child, root, source, functions, events, errors, aliases, diagnostics));
    }

    private static void validateErrorReference(JsonNode value, String source, Set<String> errors,
            List<Diagnostic> diagnostics) {
        String ref = value != null && value.isValueNode() ? value.asText() : null;
        if (ref == null || ref.isBlank()) {
            diagnostics.add(Diagnostic.error("studio.workflow.error-reference", "semantic",
                    "errorRef must not be blank", rangeForText(source, "errorRef"),
                    "Point errorRef at a declared workflow error.", WORKFLOW_PROFILE));
        } else if (!errors.contains(ref)) {
            diagnostics.add(Diagnostic.error("studio.workflow.unresolved-error", "semantic",
                    "Workflow references an undefined error: " + ref, rangeForText(source, ref),
                    "Declare the error or repair the error reference.", WORKFLOW_PROFILE));
        }
    }

    private static void validateWorkflowExtensions(JsonNode root, String source,
            List<Diagnostic> diagnostics) {
        Set<String> known = Set.of("workflow-uri-definitions");
        JsonNode extensions = root.path("extensions");
        if (extensions.isArray()) {
            extensions.forEach(extension -> {
                String id = text(extension, "extensionid");
                if (id != null && !known.contains(id)) {
                    diagnostics.add(Diagnostic.warning("studio.workflow.unknown-extension", "compatibility",
                            "Workflow extension is preserved but not understood by the local validator: " + id,
                            rangeForText(source, id),
                            "Verify the extension against the target runtime before deployment.", WORKFLOW_PROFILE));
                }
            });
        }
        root.fieldNames().forEachRemaining(field -> {
            if (field.startsWith("x-") && !"x-studio-reusable-subflow".equals(field)) {
                diagnostics.add(Diagnostic.warning("studio.workflow.unknown-extension-field", "compatibility",
                        "Workflow extension field is preserved without semantic validation: " + field,
                        rangeForField(source, field),
                        "Verify the extension against the target runtime before deployment.", WORKFLOW_PROFILE));
            }
        });
    }

    private static void validateExpressionShape(JsonNode node, String source, List<Diagnostic> diagnostics) {
        if (node.isObject()) {
            node.fields().forEachRemaining(entry -> {
                String key = entry.getKey();
                JsonNode value = entry.getValue();
                if ("condition".equals(key) || "inputCollection".equals(key) || "outputCollection".equals(key)) {
                    requireExpressionText(value, key, source, diagnostics);
                }
                if (Set.of("stateDataFilter", "actionDataFilter", "eventDataFilter").contains(key)) {
                    if (!value.isObject()) {
                        diagnostics.add(Diagnostic.error("studio.workflow.expression-placement", "schema",
                                key + " must be an object containing expression fields", rangeForText(source, key),
                                "Keep the filter as an object and enter expressions as string values.", WORKFLOW_PROFILE));
                    } else {
                        Set<String> filterFields = switch (key) {
                            case "stateDataFilter" -> Set.of("input", "output");
                            case "actionDataFilter" -> Set.of("fromStateData", "results", "toStateData");
                            default -> Set.of("data", "toStateData");
                        };
                        value.fields().forEachRemaining(filter -> {
                            if (filterFields.contains(filter.getKey())) {
                                requireExpressionText(filter.getValue(), filter.getKey(), source, diagnostics);
                            }
                        });
                    }
                }
                validateExpressionShape(value, source, diagnostics);
            });
        } else if (node.isArray()) {
            node.forEach(child -> validateExpressionShape(child, source, diagnostics));
        }
    }

    private static void requireExpressionText(JsonNode value, String field, String source,
            List<Diagnostic> diagnostics) {
        if (!value.isTextual() || value.asText().isBlank()) {
            diagnostics.add(Diagnostic.error("studio.workflow.expression-shape", "schema",
                    "Expression field '" + field + "' must contain authored text",
                    rangeForText(source, field),
                    "Enter a non-empty expression string; Studio does not evaluate it.", WORKFLOW_PROFILE));
        }
    }

    private static void collectTransitions(JsonNode node, String source, Set<String> stateNames,
            List<Diagnostic> diagnostics) {
        if (node.isObject()) {
            node.fields().forEachRemaining(entry -> {
                if ("transition".equals(entry.getKey()) && entry.getValue().isTextual()) {
                    String target = entry.getValue().asText();
                    if (!stateNames.contains(target)) {
                        diagnostics.add(Diagnostic.error("studio.workflow.transition-reference", "semantic",
                                "Transition target does not exist: " + target, rangeForText(source, target),
                                "Change the transition to an existing state or mark the state terminal.", WORKFLOW_PROFILE));
                    }
                }
                collectTransitions(entry.getValue(), source, stateNames, diagnostics);
            });
        } else if (node.isArray()) {
            node.forEach(child -> collectTransitions(child, source, stateNames, diagnostics));
        }
    }

    private static void validateCatalog(JsonNode root, String source, List<Diagnostic> diagnostics) {
        JsonNode info = root.path("info");
        if (!info.isObject()) {
            diagnostics.add(required(source, "info", "OpenAPI catalogs must contain an info object"));
        } else {
            if (!info.has("title")) diagnostics.add(required(source, "title", "The catalog info object must contain title"));
            if (!info.has("version")) diagnostics.add(required(source, "version", "The catalog info object must contain version"));
        }
        JsonNode paths = root.path("paths");
        if (!paths.isObject()) {
            diagnostics.add(required(source, "paths", "OpenAPI catalogs must contain a paths object"));
        } else {
            Set<String> operationIds = new LinkedHashSet<>();
            paths.fields().forEachRemaining(path -> {
                if (!path.getKey().startsWith("/")) {
                    diagnostics.add(Diagnostic.error("studio.openapi.path", "schema",
                            "OpenAPI path keys must start with '/': " + path.getKey(), rangeForText(source, path.getKey()),
                            "Rename the path to an absolute OpenAPI path.", CATALOG_PROFILE));
                }
                if (path.getValue().isObject()) path.getValue().fields().forEachRemaining(method -> {
                    if (Set.of("get", "put", "post", "delete", "options", "head", "patch", "trace").contains(method.getKey())) {
                        JsonNode operationIdNode = method.getValue().get("operationId");
                        String operationId = operationIdNode != null && operationIdNode.isTextual()
                                ? operationIdNode.asText().trim() : null;
                        if (operationId == null || operationId.isBlank()) {
                            diagnostics.add(Diagnostic.warning(
                                    "studio.openapi.operation-id", "schema",
                                    "Catalog operations should declare a non-empty operationId",
                                    rangeForText(source, method.getKey()),
                                    "Add a stable operationId for workflow references.", CATALOG_PROFILE));
                        } else if (!operationIds.add(operationId)) {
                            diagnostics.add(Diagnostic.error(
                                    "studio.openapi.duplicate-operation-id", "semantic",
                                    "Catalog operationId values must be unique: " + operationId,
                                    rangeForText(source, operationId),
                                    "Rename one operation so each callable operation has a unique operationId.",
                                    CATALOG_PROFILE));
                        }
                        if (!method.getValue().has("responses")) diagnostics.add(Diagnostic.error(
                                "studio.openapi.responses", "schema", "Each OpenAPI operation must declare responses",
                                rangeForText(source, method.getKey()), "Add at least one response to the operation.", CATALOG_PROFILE));
                    }
                });
            });
        }
        collectRefs(root, root, source, diagnostics);
    }

    private static void collectRefs(JsonNode node, JsonNode root, String source, List<Diagnostic> diagnostics) {
        if (node.isObject()) {
            node.fields().forEachRemaining(entry -> {
                if ("$ref".equals(entry.getKey()) && entry.getValue().isTextual()) {
                    String ref = entry.getValue().asText();
                    if (ref.startsWith("#/") && resolvePointer(root, ref.substring(2)) == null) {
                        diagnostics.add(Diagnostic.error("studio.openapi.unresolved-ref", "semantic",
                                "Local OpenAPI reference cannot be resolved: " + ref, rangeForText(source, ref),
                                "Point the $ref at a definition in this catalog.", CATALOG_PROFILE));
                    } else if (!ref.startsWith("#/")) {
                        diagnostics.add(Diagnostic.warning("studio.openapi.external-ref", "semantic",
                                "External references are not fetched by the local validator: " + ref, rangeForText(source, ref),
                                "Copy the referenced definition locally for deterministic validation.", CATALOG_PROFILE));
                    }
                }
                collectRefs(entry.getValue(), root, source, diagnostics);
            });
        } else if (node.isArray()) node.forEach(child -> collectRefs(child, root, source, diagnostics));
    }

    private static JsonNode resolvePointer(JsonNode root, String pointer) {
        JsonNode current = root;
        for (String token : pointer.split("/")) {
            String part = token.replace("~1", "/").replace("~0", "~");
            current = current == null ? null : current.get(part);
        }
        return current;
    }

    private static Diagnostic required(String source, String field, String message) {
        return Diagnostic.error("studio.required-field", "schema", message, rangeForField(source, field),
                "Add the required field to the canonical source document.", "local-schema");
    }

    private static boolean supported(String kind, String specVersion, String openapi) {
        return "catalog".equals(kind)
                ? openapi != null && openapi.startsWith("3.")
                : "0.8".equals(specVersion);
    }

    private GenerationStatus generationStatus(String path, byte[] source) {
        String relative = path.substring(WORKFLOW_PREFIX.length());
        Path generated = workspaceRoot.resolve("src/main/resources").resolve(relative).normalize();
        try {
            if (generated.startsWith(workspaceRoot) && Files.isRegularFile(generated)
                    && MessageDigest.isEqual(source, Files.readAllBytes(generated))) {
                return new GenerationStatus("in_sync", null, null, null);
            }
        } catch (IOException ignored) {
            // Report a visible out-of-sync state rather than exposing filesystem details.
        }
        return new GenerationStatus("out_of_sync", null, null, "Generated runner resource differs or is missing");
    }

    private static Set<String> stateTypes(JsonNode root) {
        Set<String> types = new LinkedHashSet<>();
        JsonNode states = root.path("states");
        if (states.isArray()) {
            for (JsonNode state : states) {
                String type = text(state, "type");
                if (type != null && !type.isBlank()) types.add(type);
            }
        }
        return types;
    }

    private static Set<String> catalogAliases(JsonNode root) {
        Set<String> aliases = new LinkedHashSet<>();
        collectCatalogAliases(root, aliases);
        return aliases;
    }

    private static List<String> functionReferences(JsonNode root) {
        List<String> references = new ArrayList<>();
        JsonNode functions = root.path("functions");
        if (!functions.isArray()) return references;
        for (JsonNode function : functions) {
            String operation = text(function, "operation");
            if (operation != null) references.add(operation);
        }
        return references;
    }

    private static List<String> catalogReferences(JsonNode root) {
        Set<String> references = new LinkedHashSet<>();
        collectCatalogReferences(root, references);
        return new ArrayList<>(references);
    }

    private static void collectCatalogReferences(JsonNode node, Set<String> references) {
        if (node.isObject()) {
            node.fields().forEachRemaining(entry -> {
                if ("definitions".equals(entry.getKey()) && entry.getValue().isObject()) {
                    entry.getValue().elements().forEachRemaining(value -> {
                        if (value.isTextual()) {
                            String reference = value.asText();
                            int classpath = reference.indexOf("classpath:/");
                            references.add(classpath >= 0
                                    ? reference.substring(classpath + "classpath:/".length()) : reference);
                        }
                    });
                }
                collectCatalogReferences(entry.getValue(), references);
            });
        } else if (node.isArray()) {
            node.forEach(child -> collectCatalogReferences(child, references));
        }
    }

    private static void collectCatalogAliases(JsonNode node, Set<String> aliases) {
        if (node.isObject()) {
            node.fields().forEachRemaining(entry -> {
                if ("operation".equals(entry.getKey()) && entry.getValue().isTextual()) {
                    String value = entry.getValue().asText();
                    int separator = value.indexOf('#');
                    if (separator > 0) aliases.add(value.substring(0, separator));
                }
                if ("definitions".equals(entry.getKey()) && entry.getValue().isObject()) {
                    entry.getValue().fieldNames().forEachRemaining(aliases::add);
                }
                collectCatalogAliases(entry.getValue(), aliases);
            });
        } else if (node.isArray()) {
            node.forEach(child -> collectCatalogAliases(child, aliases));
        }
    }

    private static DocumentMetadata metadata(JsonNode root, String kind, String specVersion,
            String openapi, String documentVersion, String name) {
        return new DocumentMetadata(
                "workflow".equals(kind) ? text(root, "id") : null,
                name, text(root, "description"), documentVersion, specVersion, openapi,
                text(root, "start"), root.get("timeouts"), root.get("constants"), root.get("annotations"),
                root.get("extensions"), namedItems(root.path("functions"), "operation"),
                namedItems(root.path("events"), "type"), namedItems(root.path("errors"), "code"),
                stateCounts(root), terminalStates(root), subflowReferences(root));
    }

    private static List<NamedItem> namedItems(JsonNode array, String detailField) {
        List<NamedItem> items = new ArrayList<>();
        if (!array.isArray()) return items;
        for (JsonNode item : array) {
            String name = text(item, "name");
            if (name != null) items.add(new NamedItem(name, text(item, detailField)));
        }
        return items;
    }

    private static Map<String, Integer> stateCounts(JsonNode root) {
        Map<String, Integer> counts = new LinkedHashMap<>();
        JsonNode states = root.path("states");
        if (!states.isArray()) return counts;
        for (JsonNode state : states) {
            String type = text(state, "type");
            if (type != null) counts.merge(type, 1, Integer::sum);
        }
        return counts;
    }

    private static List<String> terminalStates(JsonNode root) {
        List<String> terminal = new ArrayList<>();
        JsonNode states = root.path("states");
        if (!states.isArray()) return terminal;
        for (JsonNode state : states) {
            if (state.path("end").asBoolean(false)) {
                String name = text(state, "name");
                if (name != null) terminal.add(name);
            }
        }
        return terminal;
    }

    private static List<String> subflowReferences(JsonNode root) {
        Set<String> references = new LinkedHashSet<>();
        collectSubflowReferences(root, references);
        return new ArrayList<>(references);
    }

    private static void collectSubflowReferences(JsonNode node, Set<String> references) {
        if (node.isObject()) {
            node.fields().forEachRemaining(entry -> {
                if (("subFlowRef".equals(entry.getKey()) || "subflowRef".equals(entry.getKey()))
                        && entry.getValue().isValueNode()) {
                    references.add(entry.getValue().asText());
                }
                collectSubflowReferences(entry.getValue(), references);
            });
        } else if (node.isArray()) {
            node.forEach(child -> collectSubflowReferences(child, references));
        }
    }

    private static String text(JsonNode node, String field) {
        JsonNode value = node == null ? null : node.get(field);
        return value != null && value.isValueNode() ? value.asText() : null;
    }

    private static boolean isCanonicalDocument(Path file, Path canonical) {
        if (Files.isSymbolicLink(file)) return false;
        Path relative = canonical.relativize(file);
        String normalized = relative.toString().replace(file.getFileSystem().getSeparator(), "/");
        if (normalized.startsWith(".studio/") || normalized.startsWith("target/")) return false;
        String name = file.getFileName().toString().toLowerCase(Locale.ROOT);
        return normalized.startsWith("catalogs/")
                ? name.endsWith(".yaml") || name.endsWith(".yml") || name.endsWith(".json")
                : name.endsWith(".sw.yaml");
    }

    private static boolean matches(DocumentSummary summary, String requestedKind, String prefix, String query) {
        if (requestedKind != null && !requestedKind.isBlank() && !requestedKind.equals(summary.kind())) return false;
        if (prefix != null && !prefix.isBlank() && !summary.path().startsWith(prefix)) return false;
        if (query == null || query.isBlank()) return true;
        String needle = query.toLowerCase(Locale.ROOT);
        return String.join(" ", summary.path(), summary.id(), summary.displayName(),
                nullToEmpty(summary.name()), nullToEmpty(summary.documentVersion())).toLowerCase(Locale.ROOT)
                .contains(needle);
    }

    private static String nullToEmpty(String value) { return value == null ? "" : value; }

    private static String displayName(String filename) {
        if (filename.endsWith(".sw.yaml")) return filename.substring(0, filename.length() - ".sw.yaml".length());
        int dot = filename.lastIndexOf('.');
        return dot > 0 ? filename.substring(0, dot) : filename;
    }

    private static boolean reusableSubflow(String relativePath, JsonNode sourceTree) {
        if (relativePath.startsWith("sub_flows/")) return true;
        return sourceTree != null && sourceTree.path("x-studio-reusable-subflow").asBoolean(false);
    }

    static String documentId(String kind, String path) {
        return kind + "-" + sha256(kind + ":" + path).substring(0, 32);
    }

    private static String etag(byte[] bytes) { return "\"sha256:" + sha256(bytes) + "\""; }

    private static String sha256(String value) { return sha256(value.getBytes(StandardCharsets.UTF_8)); }

    private static String sha256(byte[] bytes) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(bytes);
            StringBuilder result = new StringBuilder(digest.length * 2);
            for (byte value : digest) result.append(String.format("%02x", value));
            return result.toString();
        } catch (Exception exception) {
            throw new IllegalStateException("SHA-256 is unavailable", exception);
        }
    }

    private static String safeMessage(Exception exception) {
        String message = exception.getMessage();
        return message == null || message.isBlank() ? exception.getClass().getSimpleName() : message;
    }

    private static SourceRange rangeForField(String source, String field) {
        int offset = source.indexOf("\"" + field + "\"");
        if (offset < 0) offset = source.indexOf(field + ":");
        if (offset < 0) return range(source, 0, Math.max(1, source.length()));
        return range(source, offset, Math.max(offset + field.length(), offset + 1));
    }

    private static SourceRange rangeForText(String source, String value) {
        if (value == null || value.isBlank()) return rangeForField(source, "states");
        int offset = source.indexOf(value);
        return offset < 0 ? range(source, 0, Math.max(1, source.length()))
                : range(source, offset, offset + value.length());
    }

    private static SourceRange rangeAtLocation(String source, JsonLocation location) {
        if (location == null) return range(source, 0, Math.max(1, source.length()));
        int line = Math.max(1, location.getLineNr());
        int column = Math.max(1, location.getColumnNr());
        int offset = offsetAt(source, line, column);
        return range(source, offset, Math.min(source.length(), offset + 1));
    }

    private static SourceRange range(String source, int startOffset, int endOffset) {
        int start = Math.max(0, Math.min(startOffset, source.length()));
        int end = Math.max(start + 1, Math.min(Math.max(start + 1, endOffset), Math.max(1, source.length())));
        return new SourceRange(position(source, start), position(source, end), "utf-16-code-units");
    }

    private static int offsetAt(String source, int line, int column) {
        int currentLine = 1;
        int offset = 0;
        while (currentLine < line && offset < source.length()) {
            if (source.charAt(offset++) == '\n') currentLine++;
        }
        return Math.min(source.length(), offset + Math.max(0, column - 1));
    }

    private static Position position(String source, int offset) {
        int line = 1;
        int lineStart = 0;
        for (int index = 0; index < offset && index < source.length(); index++) {
            if (source.charAt(index) == '\n') {
                line++;
                lineStart = index + 1;
            }
        }
        return new Position(offset, line, offset - lineStart + 1);
    }

    public record DocumentList(List<DocumentSummary> items, int page, int pageSize, int total) {}

    public record DocumentSummary(String id, String kind, String path, String displayName, String format,
            long sizeBytes, String etag, long revisionNumber, Instant modifiedAt, String compatibility,
            String specVersion, String openapi, GenerationStatus generation, List<Diagnostic> diagnostics,
            String documentVersion, String name, String workflowId, Set<String> stateTypes, Set<String> catalogAliases,
            List<String> functionReferences, List<String> catalogReferences, List<String> subflowReferences,
            String parseStatus, String validationState, boolean reusableSubflow) {}

    public record GenerationStatus(String state, String operationId, Instant lastAttempt, String message) {}

    public record GeneratedArtifact(String path, String state, String sourceEtag, String generatedEtag,
            Instant lastAttempt, String message) {}

    public record SyncStatus(String state, String policy, String operationId,
            List<GeneratedArtifact> artifacts) {}

    public record ValidationResult(boolean valid, List<Diagnostic> diagnostics, String etag,
            String compatibility, JsonNode sourceTree) {}

    public record ValidationReport(String scope, boolean valid, int documentsChecked,
            List<ValidationDocument> documents, List<Diagnostic> diagnostics) {}

    public record ValidationDocument(String id, String kind, String path, String etag, boolean valid,
            List<Diagnostic> diagnostics) {}

    public record RenameResult(Document document, String previousId, String previousPath) {}

    public record TrashReceipt(String trashId, String originalPath, String originalEtag,
            Instant deletedAt, Instant expiresAt, GenerationStatus generation) {}

    public record TrashMetadata(String trashId, String kind, String originalPath, String originalId,
            String originalEtag, String deletedAt, String expiresAt) {}

    public record Reference(String documentId, String path) {}

    private record FileRewrite(Path path, byte[] original, byte[] updated) {}

    public static final class WorkspaceException extends RuntimeException {
        private final int status;
        private final String code;
        private final Map<String, ?> details;

        WorkspaceException(int status, String code, String detail, Map<String, ?> details) {
            super(detail);
            this.status = status;
            this.code = code;
            this.details = details;
        }

        public int status() { return status; }
        public String code() { return code; }
        public Map<String, ?> details() { return details; }
    }

    public record Position(int offset, int line, int column) {}

    public record SourceRange(Position start, Position end, String encoding) {}

    public record RelatedRange(String message, SourceRange range) {}

    public record Diagnostic(String id, String ruleId, String phase, String severity, String message,
            String explanation, String suggestedResolution, SourceRange primaryRange,
            List<RelatedRange> relatedRanges, String fieldPath, String nodeId, String provenance,
            String documentationUrl, boolean suppressible) {
        static Diagnostic error(String ruleId, String phase, String message) {
            return error(ruleId, phase, message, null, null, "local-parser");
        }

        static Diagnostic warning(String ruleId, String phase, String message) {
            return warning(ruleId, phase, message, null, null, "local-analyzer");
        }

        static Diagnostic error(String ruleId, String phase, String message, SourceRange range,
                String resolution, String provenance) {
            return new Diagnostic(ruleId, ruleId, phase, "error", message, message, resolution, range,
                    List.of(), null, null, provenance, documentationUrl(ruleId), false);
        }

        static Diagnostic warning(String ruleId, String phase, String message, SourceRange range,
                String resolution, String provenance) {
            return new Diagnostic(ruleId, ruleId, phase, "warning", message, message, resolution, range,
                    List.of(), null, null, provenance, documentationUrl(ruleId), true);
        }

        private static String documentationUrl(String ruleId) {
            return "/studio/validation-rules.html#" + ruleId;
        }
    }

    public record Document(@JsonUnwrapped DocumentSummary summary, String content, DocumentMetadata metadata,
            JsonNode sourceTree) {
        public String id() { return summary.id(); }
        public String kind() { return summary.kind(); }
        public String path() { return summary.path(); }
        public String displayName() { return summary.displayName(); }
        public String format() { return summary.format(); }
        public long sizeBytes() { return summary.sizeBytes(); }
        public String etag() { return summary.etag(); }
        public long revisionNumber() { return summary.revisionNumber(); }
        public Instant modifiedAt() { return summary.modifiedAt(); }
        public String compatibility() { return summary.compatibility(); }
        public String specVersion() { return summary.specVersion(); }
        public String openapi() { return summary.openapi(); }
        public GenerationStatus generation() { return summary.generation(); }
        public List<Diagnostic> diagnostics() { return summary.diagnostics(); }
        public String documentVersion() { return summary.documentVersion(); }
        public String name() { return summary.name(); }
        public String workflowId() { return summary.workflowId(); }
        public Set<String> stateTypes() { return summary.stateTypes(); }
        public Set<String> catalogAliases() { return summary.catalogAliases(); }
        public List<String> functionReferences() { return summary.functionReferences(); }
        public List<String> catalogReferences() { return summary.catalogReferences(); }
        public List<String> subflowReferences() { return summary.subflowReferences(); }
        public String parseStatus() { return summary.parseStatus(); }
        public String validationState() { return summary.validationState(); }
        public boolean reusableSubflow() { return summary.reusableSubflow(); }
    }

    public record DocumentMetadata(String workflowId, String name, String description, String version,
            String specVersion, String openapi, String start, JsonNode timeouts, JsonNode constants,
            JsonNode annotations, JsonNode extensions, List<NamedItem> functions, List<NamedItem> events,
            List<NamedItem> errors, Map<String, Integer> stateCounts, List<String> terminalStates,
            List<String> subflowReferences) {}

    public record NamedItem(String name, String detail) {}

    private record ParseResult(String specVersion, String openapi, String documentVersion, String name,
            String compatibility, Set<String> stateTypes, Set<String> catalogAliases,
            List<String> functionReferences, List<String> catalogReferences, List<String> subflowReferences,
            String parseStatus, String validationState, List<Diagnostic> diagnostics, DocumentMetadata metadata,
            JsonNode sourceTree) {
        static ParseResult error(String message, String kind, SourceRange range) {
            return new ParseResult(null, null, null, null, "source-readonly", Set.of(), Set.of(), List.of(), List.of(),
                    List.of(), "error", "parse-error", List.of(Diagnostic.error("studio.parse.syntax", "parse", message,
                            range, "Fix the YAML or JSON syntax at the highlighted source range.", "local-parser")),
                    null, null);
        }
    }
}
