import { defineConfig } from 'vitest/config';

export default defineConfig({
  // e2e/ holds Playwright specs, which Vitest must not pick up.
  test: { include: ['src/**/*.test.ts'] },
});
