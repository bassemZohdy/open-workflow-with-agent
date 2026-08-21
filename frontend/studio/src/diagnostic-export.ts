import type { Issue } from './issues';

type SarifLevel = 'error' | 'warning' | 'note';

export type SarifLog = {
  version: '2.1.0';
  $schema: 'https://json.schemastore.org/sarif-2.1.0.json';
  runs: Array<{
    tool: {
      driver: {
        name: string;
        informationUri: string;
        rules: Array<{
          id: string;
          shortDescription: { text: string };
          helpUri?: string;
        }>;
      };
    };
    results: Array<{
      ruleId: string;
      level: SarifLevel;
      message: { text: string };
      locations?: Array<{
        physicalLocation: {
          artifactLocation: { uri: string };
          region?: {
            startLine: number;
            startColumn: number;
            endLine?: number;
            endColumn?: number;
          };
        };
      }>;
      properties: Record<string, string | boolean | null>;
    }>;
  }>;
};

export function diagnosticsAsJson(issues: Issue[]): string {
  return JSON.stringify(
    {
      version: 1,
      diagnostics: issues.map(({ document, diagnostic }) => ({
        document: { id: document.id, kind: document.kind, path: document.path },
        diagnostic,
      })),
    },
    null,
    2,
  );
}

export function diagnosticsAsSarif(issues: Issue[]): string {
  const ruleMap = new Map<string, SarifLog['runs'][number]['tool']['driver']['rules'][number]>();
  for (const { diagnostic } of issues) {
    if (!ruleMap.has(diagnostic.ruleId)) {
      ruleMap.set(diagnostic.ruleId, {
        id: diagnostic.ruleId,
        shortDescription: { text: diagnostic.explanation ?? diagnostic.message },
        ...(diagnostic.documentationUrl ? { helpUri: diagnostic.documentationUrl } : {}),
      });
    }
  }

  const results = issues.map(({ document, diagnostic }) => {
    const range = diagnostic.primaryRange;
    return {
      ruleId: diagnostic.ruleId,
      level: sarifLevel(diagnostic.severity),
      message: { text: diagnostic.message },
      ...(range
        ? {
            locations: [
              {
                physicalLocation: {
                  artifactLocation: { uri: document.path },
                  region: {
                    startLine: range.start.line,
                    startColumn: range.start.column,
                    endLine: range.end.line,
                    endColumn: range.end.column,
                  },
                },
              },
            ],
          }
        : {}),
      properties: {
        documentId: document.id,
        phase: diagnostic.phase,
        provenance: diagnostic.provenance,
        suppressible: diagnostic.suppressible,
        documentationUrl: diagnostic.documentationUrl,
      },
    };
  });

  const sarif: SarifLog = {
    version: '2.1.0',
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
    runs: [
      {
        tool: {
          driver: {
            name: 'OpenWorkflow Studio',
            informationUri: '/studio/validation-rules.html',
            rules: [...ruleMap.values()].sort((left, right) => left.id.localeCompare(right.id)),
          },
        },
        results,
      },
    ],
  };
  return JSON.stringify(sarif, null, 2);
}

function sarifLevel(severity: Issue['diagnostic']['severity']): SarifLevel {
  if (severity === 'error') return 'error';
  if (severity === 'warning') return 'warning';
  return 'note';
}
