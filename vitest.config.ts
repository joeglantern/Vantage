import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@domain': r('./src/domain'),
      '@modules': r('./src/modules'),
      '@platform': r('./src/platform'),
      '@web': r('./web/src'),
    },
  },
  test: {
    // Integration spins up real containers; keep those files off each other.
    fileParallelism: false,
    projects: [
      {
        extends: true,
        test: { name: 'unit', include: ['test/unit/**/*.test.ts'], environment: 'node' },
      },
      {
        extends: true,
        // Property tests are slower by nature: fast-check runs hundreds of cases.
        test: {
          name: 'property',
          include: ['test/property/**/*.test.ts'],
          environment: 'node',
          testTimeout: 60_000,
        },
      },
      {
        extends: true,
        // The interface's interactive state, rendered in jsdom. The screens
        // hold rows in state and re-run the domain rules on every edit, and
        // that behaviour is not visible to a test that only imports modules.
        test: { name: 'web', include: ['web/src/**/*.test.tsx'], environment: 'jsdom' },
      },
      {
        extends: true,
        // Integration spins up real Postgres via Testcontainers. Serial, and slow.
        test: {
          name: 'integration',
          include: ['test/integration/**/*.test.ts'],
          environment: 'node',
          testTimeout: 180_000,
          hookTimeout: 180_000,
        },
      },
    ],
  },
});
