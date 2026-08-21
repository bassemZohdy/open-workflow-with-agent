import { describe, expect, it } from 'vitest';

import { classificationForField, guidanceForVersion } from './metadata-guidance';

describe('metadata form guidance', () => {
  it('distinguishes required, optional, defaulted, extension, and unsupported fields', () => {
    expect(classificationForField('id')).toBe('required');
    expect(classificationForField('description')).toBe('optional');
    expect(classificationForField('keepActive')).toBe('defaulted');
    expect(classificationForField('extensions')).toBe('extension');
    expect(classificationForField('futureField')).toBe('unsupported');
  });

  it('provides version-aware 0.8 examples and protected guidance for other versions', () => {
    expect(guidanceForVersion('0.8').examples).toContain('start: Validate Request');
    expect(guidanceForVersion('1.0').summary).toContain('not the repository');
  });
});
