import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@domain': r('./src/domain'),
      '@modules': r('./src/modules'),
      '@platform': r('./src/platform'),
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
