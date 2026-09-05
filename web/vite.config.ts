import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  root: r('.'),
  plugins: [react()],
  resolve: {
    alias: {
      // The interface reads statuses, money and masking from the same domain
      // layer the workers use, so the two cannot drift apart.
      '@domain': r('../src/domain'),
      '@web': r('./src'),
    },
  },
  server: { port: 5173 },
  build: { outDir: r('../dist/web'), emptyOutDir: true },
});
