import { describe, expect, it } from 'vitest';

import { diagnosticsAsJson, diagnosticsAsSarif } from './diagnostic-export';
import type { Issue } from './issues';

const issue = {
  document: {
    id: 'workflow-test',
    kind: 'workflow',
    path: 'workflows/test.sw.yaml',
  },
  diagnostic: {
    id: 'studio.required-field:1',
    ruleId: 'studio.required-field',
    phase: 'schema',
    severity: 'error',
    message: 'Missing name',
    explanation: 'A name is required',
    suggestedResolution: 'Add name',
    primaryRange: {
      start: { offset: 0, line: 1, column: 1 },
      end: { offset: 3, line: 1, column: 4 },
      encoding: 'utf-16-code-units',
    },
    relatedRanges: [],
    fieldPath: 'name',
    nodeId: null,
    provenance: 'local-schema',
    documentationUrl: '/studio/validation-rules.html#studio.required-field',
    suppressible: false,
  },
} as unknown as Issue;

describe('diagnostic exports', () => {
  it('emits stable machine-readable JSON', () => {
    const parsed = JSON.parse(diagnosticsAsJson([issue])) as {
      version: number;
      diagnostics: Array<{ document: { path: string } }>;
    };
    expect(parsed.version).toBe(1);
    expect(parsed.diagnostics[0]?.document.path).toBe('workflows/test.sw.yaml');
  });

  it('maps ranges, severity, and rule help into SARIF', () => {
    const parsed = JSON.parse(diagnosticsAsSarif([issue])) as {
      version: string;
      runs: Array<{
        tool: { driver: { rules: Array<{ id: string; helpUri?: string }> } };
        results: Array<{
          level: string;
          locations?: Array<{ physicalLocation: { region: { startLine: number } } }>;
        }>;
      }>;
    };
    expect(parsed.version).toBe('2.1.0');
    expect(parsed.runs[0]?.tool.driver.rules[0]?.id).toBe('studio.required-field');
    expect(parsed.runs[0]?.tool.driver.rules[0]?.helpUri).toContain('validation-rules.html');
    expect(parsed.runs[0]?.results[0]?.level).toBe('error');
    expect(parsed.runs[0]?.results[0]?.locations?.[0]?.physicalLocation.region.startLine).toBe(1);
  });
});
