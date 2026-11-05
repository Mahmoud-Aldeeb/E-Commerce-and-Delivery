import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // The tests that need a real PostgreSQL: `npm test` does not run them
    include: ['test/integration/**/*.int.spec.ts'],
    setupFiles: ['./vitest.setup.ts'],
    // Every file works on the same database: one file at a time
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
