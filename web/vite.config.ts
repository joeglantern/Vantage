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
  server: {
    port: 5173,
    // The interface talks to the API on a same-origin path so there is no CORS
    // to configure and no base URL baked into the bundle. In production the two
    // sit behind one origin anyway, so development matching that avoids a class
    // of problem that only ever shows up after deploy.
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: false,
      },
    },
  },
  build: { outDir: r('../dist/web'), emptyOutDir: true },
});
