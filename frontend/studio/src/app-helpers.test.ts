import { describe, expect, it } from 'vitest';

import { mergeThreeWay } from './draft-helpers';

describe('Studio draft conflict helpers', () => {
  it('merges non-overlapping line changes and marks overlapping changes', () => {
    expect(mergeThreeWay('a\nb\n', 'a-local\nb\n', 'a\nb-server\n')).toBe('a-local\nb-server\n');
    expect(mergeThreeWay('a\n', 'local\n', 'server\n')).toContain('<<<<<<< LOCAL');
  });
});
