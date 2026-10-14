import { defineConfig } from 'vitest/config';

// Opt-in suite against a running Nautilus stack (`npm run test:integration`).
// Never part of `npm test`: it needs a key and creates real data. See README,
// "Integration tests".
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/integration/**/*.integration.ts'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    fileParallelism: false,
    sequence: { concurrent: false },
  },
});
