import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // The tests run in plain Node (no browser)
    environment: 'node',
    // A test file sits next to the code it tests: order-pricing.ts -> order-pricing.spec.ts
    include: ['src/**/*.spec.ts'],
    // Runs once before each test file
    setupFiles: ['./vitest.setup.ts'],
  },
});
