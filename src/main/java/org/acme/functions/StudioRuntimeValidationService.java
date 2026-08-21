package org.acme.functions;

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import jakarta.enterprise.context.ApplicationScoped;
import java.io.StringReader;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.kie.kogito.codegen.api.AddonsConfig;
import org.kie.kogito.codegen.api.GeneratedInfo;
import org.kie.kogito.codegen.api.context.KogitoBuildContext;
import org.kie.kogito.codegen.api.context.impl.QuarkusKogitoBuildContext;
import org.kie.kogito.internal.process.runtime.KogitoWorkflowProcess;
import org.kie.kogito.serverless.workflow.parser.ServerlessWorkflowParser;
import org.kie.kogito.serverless.workflow.utils.WorkflowFormat;
import org.jboss.logging.Logger;

/**
 * Runs the bundled SonataFlow parser/code-generation boundary without starting a process.
 *
 * <p>This deliberately validates saved source in memory. It never invokes a generated
 * workflow endpoint, writes runner resources, resolves remote imports, or evaluates workflow
 * input. The returned deployment and execution statuses therefore remain explicit
 * {@code not-evaluated} values.</p>
 */
@ApplicationScoped
public class StudioRuntimeValidationService {

    private static final Logger LOG = Logger.getLogger(StudioRuntimeValidationService.class);
    private static final Pattern LINE_COLUMN = Pattern.compile(
            "(?i)(?:line|ln)\\s*[=:]?\\s*(\\d+)(?:[^0-9]+(?:column|col)\\s*[=:]?\\s*(\\d+))?");
    private static final Pattern REMOTE_DEFINITION = Pattern.compile(
            "(?im)^\\s*[^\\s:]+\\s*:\\s*(https?://)");

    @ConfigProperty(name = "studio.runtime-validation.enabled", defaultValue = "false")
    boolean enabled;

    @ConfigProperty(name = "studio.runtime-validation.timeout", defaultValue = "10s")
    Duration configuredTimeout;

    @ConfigProperty(name = "studio.runtime-validation.max-concurrency", defaultValue = "1")
    int configuredConcurrency;

    @ConfigProperty(name = "studio.runtime-validation.max-output-bytes", defaultValue = "65536")
    int configuredOutputBytes;

    @jakarta.inject.Inject
    StudioDocumentService documents;

    private ExecutorService executor;
    private Semaphore slots;
    private Duration timeout;
    private int maxOutputBytes;

    @PostConstruct
    void initialize() {
        int concurrency = Math.max(1, Math.min(configuredConcurrency, 8));
        timeout = configuredTimeout == null || configuredTimeout.isNegative()
                || configuredTimeout.isZero() ? Duration.ofSeconds(10)
                : configuredTimeout.compareTo(Duration.ofMinutes(1)) > 0
                        ? Duration.ofMinutes(1) : configuredTimeout;
        maxOutputBytes = Math.max(1024, Math.min(configuredOutputBytes, 1_048_576));
        slots = new Semaphore(concurrency);
        executor = Executors.newFixedThreadPool(concurrency, runnable -> {
            Thread thread = new Thread(runnable, "studio-runtime-validation");
            thread.setDaemon(true);
            return thread;
        });
    }

    @PreDestroy
    void shutdown() {
        if (executor != null) executor.shutdownNow();
    }

    public RuntimeValidationResult validateSaved(String requestedKind, String documentId) {
        if (!enabled) {
            throw new StudioDocumentService.WorkspaceException(403,
                    "STUDIO_RUNTIME_VALIDATION_DISABLED",
                    "Runtime validation is disabled for this application profile", java.util.Map.of());
        }
        if (!"workflow".equals(requestedKind)) {
            throw new StudioDocumentService.WorkspaceException(400,
                    "STUDIO_RUNTIME_WORKFLOW_REQUIRED",
                    "SonataFlow runtime validation accepts workflow documents only", java.util.Map.of());
        }
        StudioDocumentService.Document document = documents.read(requestedKind, documentId)
                .orElseThrow(() -> new StudioDocumentService.WorkspaceException(404,
                        "STUDIO_DOCUMENT_NOT_FOUND", "Document not found", java.util.Map.of()));
        if (!slots.tryAcquire()) {
            throw new StudioDocumentService.WorkspaceException(429,
                    "STUDIO_RUNTIME_VALIDATION_BUSY",
                    "The runtime validation capacity is currently full", java.util.Map.of());
        }

        Instant started = Instant.now();
        Future<CompileResult> future;
        try {
            future = executor.submit(() -> {
                try {
                    return compile(document);
                } finally {
                    // Keep the slot occupied until an interrupted parser actually exits.
                    slots.release();
                }
            });
        } catch (RuntimeException exception) {
            slots.release();
            throw exception;
        }
        try {
            CompileResult result = future.get(timeout.toMillis(), TimeUnit.MILLISECONDS);
            return publicResult(document, result.runtimeStatus(), result.deploymentStatus(),
                    result.executionStatus(), result.nodeCount(), result.diagnostics(), elapsedMillis(started));
        } catch (TimeoutException exception) {
            future.cancel(true);
            return timedOut(document, elapsedMillis(started));
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            future.cancel(true);
            throw new StudioDocumentService.WorkspaceException(503,
                    "STUDIO_RUNTIME_VALIDATION_INTERRUPTED",
                    "Runtime validation was interrupted before completion", java.util.Map.of());
        } catch (ExecutionException exception) {
            LOG.debugf(exception.getCause(), "Studio runtime validation worker failed");
            return failed(document, elapsedMillis(started), exception.getCause());
        }
    }

    private CompileResult compile(StudioDocumentService.Document document) {
        try {
            String remoteImport = remoteImport(document.sourceTree(), false);
            Matcher remoteReference = REMOTE_DEFINITION.matcher(document.content());
            if (remoteImport != null || remoteReference.find()) {
                int remoteOffset = remoteImport == null ? remoteReference.start(1)
                        : document.content().indexOf(remoteImport);
                return new CompileResult("invalid", "not-evaluated", "not-evaluated", 0,
                        List.of(StudioDocumentService.Diagnostic.error(
                                "studio.runtime.remote-import-blocked", "runtime",
                                "Runtime validation refuses remote workflow imports and URLs",
                                sourceRangeAtOffset(document.content(), Math.max(0, remoteOffset)),
                                "Use a local classpath or workspace reference before runtime validation",
                                "sonataflow-runtime")));
            }
            WorkflowFormat format = WorkflowFormat.fromFileName(document.path());
            KogitoBuildContext context = QuarkusKogitoBuildContext.builder()
                    .withPackageName("org.acme.functions.studio.validation")
                    .withClassLoader(Thread.currentThread().getContextClassLoader())
                    .withAddonsConfig(AddonsConfig.DEFAULT)
                    .build();
            ServerlessWorkflowParser parser = ServerlessWorkflowParser
                    .of(new StringReader(document.content()), format, context)
                    .withBaseURI(documents.workspaceRoot().resolve(document.path()).getParent());
            GeneratedInfo<KogitoWorkflowProcess> generated = parser.getProcessInfo();
            KogitoWorkflowProcess process = generated.info();
            int nodeCount = process == null || process.getNodesRecursively() == null
                    ? 0 : process.getNodesRecursively().size();
            return new CompileResult("valid", "not-evaluated", "not-evaluated", nodeCount, List.of());
        } catch (Throwable exception) {
            return new CompileResult("invalid", "not-evaluated", "not-evaluated", 0,
                    List.of(runtimeDiagnostic(document.content(), exception)));
        }
    }

    private RuntimeValidationResult timedOut(StudioDocumentService.Document document, long elapsedMillis) {
        StudioDocumentService.Diagnostic diagnostic = StudioDocumentService.Diagnostic.error(
                "studio.runtime.timeout", "runtime", "SonataFlow validation exceeded the configured timeout",
                null, "Reduce document size or increase the bounded runtime-validation timeout",
                "sonataflow-runtime");
        return publicResult(document, "timed-out", "not-evaluated", "not-evaluated", 0,
                List.of(diagnostic), elapsedMillis);
    }

    private RuntimeValidationResult failed(StudioDocumentService.Document document, long elapsedMillis,
            Throwable exception) {
        return publicResult(document, "invalid", "not-evaluated", "not-evaluated", 0,
                List.of(runtimeDiagnostic(document.content(), exception)), elapsedMillis);
    }

    private RuntimeValidationResult publicResult(StudioDocumentService.Document document,
            String runtimeStatus, String deploymentStatus, String executionStatus, int nodeCount,
            List<StudioDocumentService.Diagnostic> diagnostics, long elapsedMillis) {
        List<StudioDocumentService.Diagnostic> bounded = boundDiagnostics(diagnostics);
        int outputBytes = bounded.stream().mapToInt(item -> item.message().length()).sum();
        boolean specificationValid = "valid".equalsIgnoreCase(document.validationState());
        return new RuntimeValidationResult(document.id(), document.path(), document.etag(),
                specificationValid ? "valid" : "invalid", runtimeStatus, deploymentStatus,
                executionStatus, specificationValid && "valid".equals(runtimeStatus), true, false,
                elapsedMillis, outputBytes, nodeCount, bounded);
    }

    private static long elapsedMillis(Instant started) {
        return Math.max(0, Duration.between(started, Instant.now()).toMillis());
    }

    private StudioDocumentService.Diagnostic runtimeDiagnostic(String source, Throwable exception) {
        String message = exception == null ? "SonataFlow validation failed"
                : exception.getMessage() == null || exception.getMessage().isBlank()
                        ? exception.getClass().getSimpleName() : exception.getMessage();
        String safe = message.length() > 4096 ? message.substring(0, 4096) + "…" : message;
        return StudioDocumentService.Diagnostic.error("studio.runtime.compile", "runtime",
                "SonataFlow parser/code generation rejected the saved workflow: " + safe,
                sourceRange(source, safe), "Repair the runtime diagnostic and validate again",
                "sonataflow-runtime");
    }

    private List<StudioDocumentService.Diagnostic> boundDiagnostics(
            List<StudioDocumentService.Diagnostic> diagnostics) {
        List<StudioDocumentService.Diagnostic> bounded = new ArrayList<>();
        int used = 0;
        for (StudioDocumentService.Diagnostic diagnostic : diagnostics) {
            int size = diagnostic.message() == null ? 0 : diagnostic.message().length();
            if (used + size > maxOutputBytes) break;
            bounded.add(diagnostic);
            used += size;
        }
        if (bounded.size() < diagnostics.size()) {
            bounded.add(StudioDocumentService.Diagnostic.warning("studio.runtime.output-truncated", "runtime",
                    "Runtime diagnostics were truncated at the configured output limit", null,
                    "Inspect the source locally or increase the bounded output limit", "sonataflow-runtime"));
        }
        return bounded;
    }

    private static StudioDocumentService.SourceRange sourceRange(String source, String message) {
        Matcher matcher = LINE_COLUMN.matcher(message);
        if (!matcher.find()) return null;
        int line = Integer.parseInt(matcher.group(1));
        int column = matcher.group(2) == null ? 1 : Integer.parseInt(matcher.group(2));
        int offset = offsetAt(source, line, column);
        StudioDocumentService.Position start = new StudioDocumentService.Position(offset, line, column);
        StudioDocumentService.Position end = new StudioDocumentService.Position(
                Math.min(source.length(), offset + 1), line, column + 1);
        return new StudioDocumentService.SourceRange(start, end, "utf-16-code-units");
    }

    private static StudioDocumentService.SourceRange sourceRangeAtOffset(String source, int offset) {
        int bounded = Math.max(0, Math.min(offset, source.length()));
        int line = 1;
        int lineStart = 0;
        for (int index = 0; index < bounded; index++) {
            if (source.charAt(index) == '\n') {
                line++;
                lineStart = index + 1;
            }
        }
        int column = bounded - lineStart + 1;
        StudioDocumentService.Position start = new StudioDocumentService.Position(bounded, line, column);
        StudioDocumentService.Position end = new StudioDocumentService.Position(
                Math.min(source.length(), bounded + 1), line, column + 1);
        return new StudioDocumentService.SourceRange(start, end, "utf-16-code-units");
    }

    private static String remoteImport(JsonNode node, boolean insideImportMap) {
        if (node == null) return null;
        if (node.isObject()) {
            var fields = node.fields();
            while (fields.hasNext()) {
                var entry = fields.next();
                String key = entry.getKey();
                JsonNode value = entry.getValue();
                boolean importMap = insideImportMap || "definitions".equals(key);
                if ((importMap || "subFlowRef".equalsIgnoreCase(key)) && value.isTextual()
                        && value.asText().matches("(?i)https?://.*")) {
                    return value.asText();
                }
                String nested = remoteImport(value, importMap);
                if (nested != null) return nested;
            }
        } else if (node.isArray()) {
            for (JsonNode child : node) {
                String nested = remoteImport(child, insideImportMap);
                if (nested != null) return nested;
            }
        }
        return null;
    }

    private static int offsetAt(String source, int line, int column) {
        int currentLine = 1;
        int offset = 0;
        while (currentLine < line && offset < source.length()) {
            if (source.charAt(offset++) == '\n') currentLine++;
        }
        return Math.min(source.length(), offset + Math.max(0, column - 1));
    }

    private record CompileResult(String runtimeStatus, String deploymentStatus, String executionStatus,
            int nodeCount, List<StudioDocumentService.Diagnostic> diagnostics) {}

    public record RuntimeValidationResult(String documentId, String path, String sourceEtag,
            String specificationStatus, String runtimeStatus, String deploymentStatus,
            String executionStatus, boolean valid, boolean readOnly, boolean sideEffectsExecuted,
            long elapsedMillis, int diagnosticOutputBytes, int compiledNodeCount,
            List<StudioDocumentService.Diagnostic> diagnostics) {}
}
