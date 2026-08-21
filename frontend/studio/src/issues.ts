import { type Diagnostic, type DocumentSummary } from './workspace';

export type Issue = { document: DocumentSummary; diagnostic: Diagnostic };
export type IssueSeverity = 'all' | Diagnostic['severity'];

export function collectIssues(documents: DocumentSummary[]): Issue[] {
  return documents.flatMap((document) =>
    document.diagnostics.map((diagnostic) => ({ document, diagnostic })),
  );
}

export function filterIssues(
  issues: Issue[],
  severity: IssueSeverity,
  phase: string,
  query: string,
): Issue[] {
  const needle = query.trim().toLowerCase();
  return issues.filter(({ document, diagnostic }) => {
    if (severity !== 'all' && diagnostic.severity !== severity) return false;
    if (phase !== 'all' && diagnostic.phase !== phase) return false;
    if (!needle) return true;
    return [
      document.path,
      diagnostic.ruleId,
      diagnostic.message,
      diagnostic.explanation ?? '',
      diagnostic.suggestedResolution ?? '',
    ]
      .join(' ')
      .toLowerCase()
      .includes(needle);
  });
}
