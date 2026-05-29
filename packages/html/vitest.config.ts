import { defineConfig } from 'vitest/config';

// Node environment — this package's tests exercise argv parsing and
// filesystem-backed entry resolution. No DOM is needed.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
  },
});
