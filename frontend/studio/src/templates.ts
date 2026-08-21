import type { DocumentKind } from './workspace';

export type TemplateKind = DocumentKind | 'subflow';

export function templateFor(kind: TemplateKind, name: string): { format: 'yaml'; content: string } {
  const safeName = name.trim() || (kind === 'catalog' ? 'New Catalog' : 'New Workflow');
  const yamlName = quoteYaml(safeName);
  if (kind === 'catalog') {
    return {
      format: 'yaml',
      content: `openapi: 3.0.3\ninfo:\n  title: ${yamlName}\n  version: '1.0'\nservers:\n  - url: /\npaths: {}\n`,
    };
  }
  return {
    format: 'yaml',
    content: `id: ${slugify(safeName)}\nversion: '1.0'\nspecVersion: '0.8'\nname: ${yamlName}\nstart: End\nstates:\n  - name: End\n    type: inject\n    data: {}\n    end: true\n`,
  };
}

export function templatePath(kind: TemplateKind, name: string): string {
  const base = slugify(name) || (kind === 'catalog' ? 'new-catalog' : 'new-workflow');
  if (kind === 'catalog') return `catalogs/${base}.yaml`;
  if (kind === 'subflow') return `sub_flows/${base}.sw.yaml`;
  return `${base}.sw.yaml`;
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function quoteYaml(value: string): string {
  return `'${value.replaceAll("'", "''").replace(/[\r\n]+/g, ' ')}'`;
}
