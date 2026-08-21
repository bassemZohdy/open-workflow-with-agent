import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { App } from './app';

describe('Studio workspace explorer', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('renders the isolated Studio shell and preserves the root console link', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: string) =>
        input.startsWith('/api/')
          ? Promise.resolve({
              ok: true,
              status: 200,
              json: async () => ({ items: [], page: 1, pageSize: 200, total: 0 }),
            })
          : Promise.resolve({ ok: true, status: 200 }),
      ),
    );
    const root = document.createElement('div');
    document.body.append(root);

    // The component tree is intentionally verified through its stable landmarks and links;
    // browser E2E covers the packaged route and real runtime health endpoint.
    const appRoot = createRoot(root);
    await act(async () => {
      appRoot.render(<App />);
    });

    expect(document.body.textContent).toContain('OpenWorkflow');
    expect(document.querySelector('a[href="/"]')).not.toBeNull();
    expect(document.body.textContent).toContain('No matching documents');
    appRoot.unmount();
  });
});
