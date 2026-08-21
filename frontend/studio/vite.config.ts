import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const backend = 'http://localhost:8080';

export default defineConfig({
  base: '/studio/',
  plugins: [react()],
  build: {
    outDir: '../../target/studio-dist',
    emptyOutDir: true,
    // Source maps are useful during local development but expose the authored
    // frontend sources from the production Quarkus artifact.
    sourcemap: false,
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api/studio': { target: backend, changeOrigin: false },
      '/q': { target: backend, changeOrigin: false },
      '/agent': { target: backend, changeOrigin: false },
      '/agent_call': { target: backend, changeOrigin: false },
      '/llm_chat': { target: backend, changeOrigin: false },
    },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    clearMocks: true,
  },
});
