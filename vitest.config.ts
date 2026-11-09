import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // The CLI entry point is exercised end-to-end in a child process (test/scan.test.ts),
      // which v8 coverage cannot see.
      exclude: ['src/cli.ts', 'src/index.ts', 'src/types.ts'],
      reporter: ['text-summary', 'lcov'],
      thresholds: { lines: 85, functions: 85, branches: 70, statements: 80 },
    },
  },
});
