export type FieldClassification =
  'required' | 'optional' | 'defaulted' | 'extension' | 'unsupported';

const classifications: Record<string, FieldClassification> = {
  id: 'required',
  name: 'required',
  description: 'optional',
  version: 'optional',
  specVersion: 'required',
  expressionLang: 'optional',
  start: 'required',
  keepActive: 'defaulted',
  timeouts: 'optional',
  constants: 'optional',
  annotations: 'optional',
  extensions: 'extension',
};

export const knownWorkflowTopLevelFields = new Set([
  ...Object.keys(classifications),
  'states',
  'events',
  'errors',
  'functions',
  'retries',
  'do',
  'input',
  'output',
]);

export function classificationForField(field: string): FieldClassification {
  return classifications[field] ?? 'unsupported';
}

export type VersionGuidance = {
  title: string;
  summary: string;
  examples: string[];
};

export function guidanceForVersion(version: string): VersionGuidance {
  if (version === '0.8' || !version) {
    return {
      title: '0.8 authoring guidance',
      summary:
        'The repository workflows use the Serverless Workflow 0.8 profile. Expressions remain authored text and are never evaluated by Studio.',
      examples: [
        'id: agent_call',
        'start: Validate Request',
        'expressionLang: jq',
        'condition: ${ .mode == "sync" }',
      ],
    };
  }
  return {
    title: `${version} authoring guidance`,
    summary: `This version is not the repository's primary 0.8 authoring profile. Keep unsupported fields in Source and validate before saving.`,
    examples: [
      'Select a declared start state.',
      'Use Source for fields not represented by this form.',
    ],
  };
}
