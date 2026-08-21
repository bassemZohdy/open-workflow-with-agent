import { describe, expect, it } from 'vitest';

import { templateFor, templatePath } from './templates';

describe('Studio source templates', () => {
  it('creates valid workflow and subflow paths with the repository extension', () => {
    expect(templatePath('workflow', 'Support Intake')).toBe('support-intake.sw.yaml');
    expect(templatePath('subflow', 'Shared Step')).toBe('sub_flows/shared-step.sw.yaml');
    expect(templateFor('workflow', 'Support Intake').content).toContain("specVersion: '0.8'");
  });

  it('creates an OpenAPI catalog skeleton', () => {
    const template = templateFor('catalog', 'HTTP Catalog');
    expect(templatePath('catalog', 'HTTP Catalog')).toBe('catalogs/http-catalog.yaml');
    expect(template.content).toContain('openapi: 3.0.3');
    expect(template.content).toContain('paths: {}');
  });

  it('quotes names that contain YAML punctuation', () => {
    expect(templateFor('workflow', "Owner's: Intake").content).toContain(
      "name: 'Owner''s: Intake'",
    );
  });
});
