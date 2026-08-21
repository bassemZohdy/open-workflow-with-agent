import { describe, expect, it } from 'vitest';

import { collectIssues, filterIssues } from './issues';
import type { DocumentSummary } from './workspace';

const document = {
  id: 'workflow-test',
  path: 'workflows/test.sw.yaml',
  diagnostics: [
    {
      id: 'studio.required-field',
      ruleId: 'studio.required-field',
      phase: 'schema',
      severity: 'error',
      message: 'Missing name',
      explanation: 'A name is required',
      suggestedResolution: 'Add name',
      primaryRange: null,
      relatedRanges: [],
      fieldPath: null,
      nodeId: null,
      provenance: 'local-schema',
      documentationUrl: '/studio/validation-rules.html#studio.required-field',
      suppressible: false,
    },
  ],
} as unknown as DocumentSummary;

describe('issue helpers', () => {
  it('collects diagnostics and filters by severity, phase, and text', () => {
    const issues = collectIssues([document]);
    expect(issues).toHaveLength(1);
    expect(filterIssues(issues, 'error', 'schema', 'missing')).toHaveLength(1);
    expect(filterIssues(issues, 'warning', 'all', '')).toHaveLength(0);
  });
});
