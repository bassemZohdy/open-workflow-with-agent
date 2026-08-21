import { describe, expect, it } from 'vitest';

import { dependencyImpact } from './delete-impact';

describe('delete impact helpers', () => {
  it('normalizes server dependency details for the review panel', () => {
    expect(
      dependencyImpact([
        { documentId: 'workflow-a', path: 'workflows/a.sw.yaml' },
        { documentId: 'ignored' },
        'ignored',
      ]),
    ).toEqual([{ documentId: 'workflow-a', path: 'workflows/a.sw.yaml' }]);
    expect(dependencyImpact(null)).toEqual([]);
  });
});
