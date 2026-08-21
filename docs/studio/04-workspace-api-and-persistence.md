# Studio workspace API and persistence behavior

Status: proposed implementation contract for `STUDIO-004`  
Scope: the first OpenWorkflow Studio workspace API, source persistence boundary, and
generated-artifact lifecycle

This note defines the API that the Studio uses to manage workflow and catalog source
documents. The canonical source package remains the authority. The API never treats a
compiled classpath copy, a generated deployment manifest, or a browser draft as an
independent editable document.

## 1. Persistence boundary

The workspace root is the repository root selected by the operator. In the current
repository the editable and generated trees are:

| Role | Location | API behavior |
| --- | --- | --- |
| Canonical workflow documents | `workflows/*.sw.yaml`, `workflows/sub_flows/*` | Editable source of truth |
| Canonical catalog documents | `workflows/catalogs/*` | Editable source of truth |
| Quarkus/SonataFlow runner mirror | `src/main/resources/` | Generated; never directly editable |
| GitOps ConfigMap inputs | `workflows/` through `deploy/kustomization.yaml` | Generated deployment input; never directly editable |
| Primary SonataFlow CR flow | `deploy/sonataflow.yaml` | Generated from `workflows/agent-call.sw.yaml`; never directly editable |
| Recovery metadata | `.studio/recovery/` | Service-owned; excluded from document listings |

The API is enabled only when a workspace root has been explicitly configured. A packaged
runtime with no writable workspace is read-only or returns `503 STUDIO_WORKSPACE_DISABLED`
for mutation operations. Studio mutation is an independent capability: `STUDIO_WRITE_ENABLED`
must be set to `true` for packaged or custom profiles; it defaults to enabled only in
development and test profiles. The workspace root is canonicalized once at startup; every
request rejects path traversal, symlink escapes, absolute paths, and paths outside the
allowlisted document directories.

Document IDs are URL-safe opaque identifiers derived from the document kind and normalized
relative path. They are not written into YAML or JSON. A rename returns both the old and
new IDs so the client can reconcile source, form, graph, diagnostics, and undo state.

## 2. API surface

The contract is versioned by path under `/api/studio/v1/`. JSON envelope operations use
`application/json`; source export uses `application/yaml`, `text/yaml`, or
`application/json`; normalized failures use `application/problem+json`. The published
contract is [`openapi/studio-api.yaml`](openapi/studio-api.yaml).

### Bundled runtime validation boundary

`POST /api/studio/v1/runtime-validation/workflow/{documentId}` validates a saved workflow
through the `ServerlessWorkflowParser` bundled with this Quarkus/SonataFlow application. It
is a parser/code-generation boundary only: it never starts a process, invokes an operation or
catalog, evaluates workflow input, writes canonical/generated files, or fetches remote imports.
The response separates `specificationStatus`, `runtimeStatus`, `deploymentStatus`, and
`executionStatus`; deployment and execution remain `not-evaluated` until their dedicated
Studio integrations exist. The endpoint is disabled by default in packaged/custom profiles;
enable it deliberately with `STUDIO_RUNTIME_VALIDATION_ENABLED=true` and retain the bounded
timeout, concurrency, and diagnostic-output settings. A busy validator returns `429`, and a
timeout returns a bounded `timed-out` result rather than executing the workflow as a fallback.

| Method | Path | Purpose | Mutation |
| --- | --- | --- | --- |
| `GET` | `/documents` | List workflow or catalog summaries | No |
| `POST` | `/documents` | Create a new source document | Yes |
| `GET` | `/documents/{kind}/{documentId}` | Read metadata and source | No |
| `POST` | `/documents/{kind}/{documentId}/validate` | Validate stored source or an unsaved draft | No |
| `POST` | `/documents/validate` | Validate one document, its dependency closure, or the workspace | No |
| `POST` | `/runtime-validation/workflow/{documentId}` | Validate saved source with the bundled parser/code-generation boundary | No |
| `PUT` | `/documents/{kind}/{documentId}` | Replace source contents | Yes |
| `POST` | `/documents/{kind}/{documentId}/rename` | Rename/move within the allowlisted tree | Yes |
| `DELETE` | `/documents/{kind}/{documentId}` | Move source to recoverable trash | Yes |
| `GET` | `/sync` | Read generated-artifact sync status | No |
| `POST` | `/sync` | Retry/coalesce generation from canonical sources | Yes, derived only |
| `POST` | `/trash/{trashId}/restore` | Restore a deleted document with a conflict check | Yes |

The list endpoint supports `kind`, `prefix`, `query`, `includeDiagnostics`, `page`, and
`pageSize`. It returns stable paths, content hashes, compatibility mode, source size, and
generation status, but not full source content. Reads return a JSON envelope by default;
the same resource can be requested as raw source with an appropriate `Accept` header.

Creation requires `kind`, a relative `path`, and source `content`. The server infers the
format only when the extension is unambiguous; otherwise the request must supply `format`.
Updates replace the complete source string so the server can hash and atomically persist
exact bytes. Partial JSON Patch is intentionally excluded from v1 because it cannot
express the lossless YAML source-edit guarantees defined by STUDIO-003.

Validation never persists. With no draft body it validates the stored revision; with a
draft body it validates that body and returns diagnostics against the draft's source
ranges. The scope endpoint accepts `document`, `dependencies`, or `workspace`; dependency
scope follows catalog and subflow references transitively. Validation runs in ordered phases: parse, schema, semantic, compatibility, and
optional runtime/resource checks. A source with errors remains readable, but mutation
through a form or graph is blocked when the compatibility profile requires source-only
editing.

The Issues panel can export the same aggregated diagnostics as deterministic JSON or SARIF,
including rule IDs, source locations, severity, provenance, rule documentation, and
suppression metadata.

For the active workflow draft, the Issues panel can offer conservative quick fixes for a
missing switch default, a duplicate state declaration, an unreachable state or switch branch,
and a uniquely normalized broken state reference. Fixes are computed in the browser and are
eligible only when the target is unambiguous; multi-location edits are never applied directly.
Every offered fix opens a complete source diff and applies to the in-memory draft only. The
existing validation, save preview, ETag check, and write-enabled boundary still govern any
canonical write.

The local semantic workflow pass currently checks state graph reachability and terminal
behavior, self-loops and dead ends, switch default/condition coverage, callback event
correlation, function/event/error references, catalog aliases and operation IDs, subflow
targets, and preserved unknown extensions. These checks do not evaluate user expressions or
execute workflow side effects; unresolved or runtime-dependent cases remain explicit
diagnostics with source ranges and local rule provenance.

## 3. Headers, content negotiation, and errors

Every request may send `X-Request-ID`. If absent, the server generates a UUIDv4. The value
is echoed in the response and included in every problem response and structured log event.
The server rejects values over 128 ASCII characters and does not treat the header as an
authentication credential. `X-Studio-API-Version: 1` identifies the selected contract
version; the URL remains the authoritative version selector.

All errors use one shape:

```json
{
  "type": "https://openworkflow.local/problems/studio-revision-conflict",
  "title": "Document revision is stale",
  "status": 412,
  "code": "STUDIO_REVISION_CONFLICT",
  "detail": "The document changed after it was loaded.",
  "instance": "/api/studio/v1/documents/workflow/abc",
  "requestId": "b3b2f29e-7de4-4f2e-9551-2fe45d9c8bd1",
  "fieldErrors": [],
  "conflict": {
    "expectedEtag": "\"sha256:old\"",
    "actualEtag": "\"sha256:new\"",
    "currentDocument": { "id": "abc", "etag": "\"sha256:new\"" },
    "merge": "three-way-client"
  }
}
```

Important status codes are:

| Status | Code | Meaning |
| --- | --- | --- |
| `400` | `STUDIO_INVALID_REQUEST` | Malformed JSON, unsupported content type, or invalid field |
| `401`/`403` | `STUDIO_UNAUTHENTICATED` / `STUDIO_FORBIDDEN` | Existing bearer-key boundary rejects the request |
| `404` | `STUDIO_DOCUMENT_NOT_FOUND` | No document or trash entry at the requested ID |
| `409` | `STUDIO_DUPLICATE_PATH` | A live document already owns the requested path |
| `412` | `STUDIO_REVISION_CONFLICT` | `If-Match` does not match the current raw-byte hash |
| `413` | `STUDIO_DOCUMENT_TOO_LARGE` | Source exceeds the 2 MiB v1 limit |
| `415` | `STUDIO_UNSUPPORTED_MEDIA_TYPE` | Unsupported request or response representation |
| `422` | `STUDIO_INVALID_DOCUMENT` | Syntax is valid enough to read, but the requested mutation violates document rules |
| `428` | `STUDIO_PRECONDITION_REQUIRED` | A mutation omitted the required `If-Match` or `If-None-Match` header |
| `503` | `STUDIO_WORKSPACE_DISABLED` / `STUDIO_GENERATION_UNAVAILABLE` | Workspace or derived-artifact worker is unavailable |

The server does not echo source secrets into logs or error details. Error messages include
field paths and safe source ranges where useful; raw source is returned only in an
authenticated document response or an explicit conflict representation.

## 4. Optimistic concurrency

`ETag` is the quoted SHA-256 hash of the exact source bytes, including newline style,
BOM, and final-newline state. `GET` returns the current ETag. `PUT`, `rename`, and
`delete` require `If-Match` with the revision the client edited. `POST` create and restore
use `If-None-Match: *` to assert that the target path is still free.

The server responds with `428` when a required precondition is missing and `412` when it
is stale. A stale-save response includes the actual current ETag, the expected ETag, the
current document metadata and source (subject to the same size limit), and the hint
`three-way-client`. The client retains its submitted draft and the base revision, fetches
the current revision if needed, performs a three-way merge using the STUDIO-003 source
model, and presents a diff before retrying with the new ETag. The server never silently
chooses either side or overwrites a newer revision.

List/read responses also expose `modifiedAt` and `revisionNumber` for display and audit,
but the content hash is the concurrency authority. A successful write returns the new
ETag and a generation status; a failed generated sync does not roll back the already
committed canonical source.

## 5. Atomic save, recovery, and deletion

For a canonical write the persistence service:

1. Revalidates the normalized path, document kind, extension, size, and symlink status.
2. Acquires a per-canonical-path lock and rechecks `If-Match` against the current bytes.
3. Writes the complete source to a service-owned temporary file in the same directory.
4. Writes a recovery snapshot and operation record under `.studio/recovery/` before the
   old version is discarded from the active path.
5. Flushes the file, applies the configured file mode, and atomically replaces the target
   with a same-filesystem rename.
6. Enqueues derived-artifact synchronization and returns the new revision and status.

Temporary names contain the request ID and document ID, are never listed, and are cleaned
after success, failure, and startup recovery. Startup cleanup removes only service-owned
temporary files older than the configured grace period; it never recursively deletes a
workspace directory.

Backups are retained for 30 days by default (configurable), with a size/count quota and
oldest-first pruning. Before update, rename, and delete, the previous bytes and metadata
are copied into a recovery entry with its source ETag, operation ID, timestamp, and actor.

Deletion is a recoverable move, not an unlink: the file is atomically moved to
`.studio/recovery/trash/<timestamp>-<trashId>/`, with a manifest retaining the original
relative path and hash. The live path is then absent and no duplicate path is allowed.
The restore endpoint requires the trash entry's original path to be free and an explicit
precondition; otherwise it returns a conflict without discarding the trash copy. Trash
retention is 30 days by default. Purging expired recovery data is a separate operator
maintenance action, never part of a normal delete request.

## 6. Naming and document limits

The v1 allowlist is deliberately narrow:

- Workflow paths are relative to `workflows/`, use `.sw.yaml`, and may be at the package
  root or below `sub_flows/`.
- Catalog paths are relative to `workflows/catalogs/`, use `.yaml`, `.yml`, or `.json`.
- Names use UTF-8 but reject NUL, control characters, path separators in a single name,
  leading dots, reserved service names (`.studio`, `target`, `src`, `deploy`), and
  trailing spaces or dots.
- A normalized path is case-sensitive for storage but duplicate checks use a
  case-folded comparison on case-insensitive filesystems.
- Maximum source size is 2 MiB; maximum path length is 240 bytes; maximum list page size
  is 200 documents.
- Duplicate live paths are rejected with `409`; rename is not an overwrite operation.

These rules apply equally to create, update, rename, restore, and generated-sync input.
The service does not follow symlinks while resolving a document path.

## 7. Generated artifacts and sync policy

The selected policy is **on-save asynchronous synchronization**. A successful canonical
create/update/rename/delete commits source first and coalesces a generation job. The UI
shows `pending`, `in_sync`, `out_of_sync`, `blocked`, or `disabled` status and the latest
operation ID. `POST /sync` retries or explicitly requests the same job; it does not accept
hand-authored generated content.

The generation worker applies the existing repository rules:

| Canonical change | Derived action |
| --- | --- |
| Any workflow or catalog under `workflows/` | Mirror the package byte-for-byte into `src/main/resources/` |
| Any non-primary workflow/catalog deployment input | Recompute the deployment-input fingerprint and check the Kustomize source list |
| `workflows/agent-call.sw.yaml` | Regenerate the inline `spec.flow` in `deploy/sonataflow.yaml` |

Generated writes use the same temp-file/atomic-replace protocol. A generation failure
leaves canonical source intact, marks the workspace `out_of_sync`, records diagnostics,
and blocks a release/build readiness check until resolved. The Studio never presents a
green deploy/sync status based only on the canonical save response. `GET /sync` exposes
per-artifact ETags, source revision, last attempt, failure details, and a safe retry
operation ID.

The guarded implementation resolves every mutation against the configured
`STUDIO_WORKSPACE_ROOT/workflows/` tree. It rejects absolute, traversal, encoded, null-byte,
disallowed-extension, case-normalization, and symbolic-link paths before writing. Updates use
same-directory temporary files followed by an atomic move where the filesystem supports it;
existing POSIX permissions are copied to the replacement. `If-Match` is mandatory for update,
rename, and delete. A stale tag returns `412` with the expected tag, current tag, and current
document summary so a client can build a three-way merge. Deletes move the source and metadata
to `.studio/trash/<trashId>/`; restore requires `If-None-Match` and returns the canonical
document. A delete with dependents returns `409` until the caller explicitly supplies
`acceptDependencyImpact=true`. Audit records include only action, kind, path, and hashes.

The existing shell generators remain the first implementation of the worker's behavior:
`deploy/sync-runner-resources.sh` and `deploy/generate-sonataflow.sh`. They must gain a
service-owned invocation mode before production API writes are enabled, so the API can
capture exit status and prevent concurrent generation jobs.

## 8. API versioning, compatibility, and rollout

`/api/studio/v1/` is a compatibility promise for the JSON envelope and problem shape.
Additive fields are allowed; removing or changing field meaning requires `/v2/`. Source
documents are versioned independently through the STUDIO-003 compatibility profile.
An unsupported Serverless Workflow or OpenAPI major remains readable as source and
diagnostics, but mutation is rejected with `422` unless the request is an explicit raw
source operation supported by the active profile.

The OpenAPI file is the review artifact for API shape. Once the backend implementation
starts, contract tests must verify every path, status, header, content type, and example;
the generated runtime `/q/openapi` document must be checked for parity before the API is
enabled in the packaged profile.

## 9. Acceptance traceability

This note and its OpenAPI contract cover all `STUDIO-004` requirements: CRUD and validate
operations for workflows/catalogs, content types, normalized errors, request IDs,
versioning, ETags and stale-save recovery, atomic persistence, cleanup, backups, trash,
generated-file policy and status, naming/size/duplicate rules, and a published
`/api/studio/` contract.
