import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: [
      'src/**/*.test.ts',
      'test/**/*.test.ts'
    ],
    exclude: [
      'node_modules/**',
      'dist/**',
      'api/**'
    ],
    testTimeout: 30000,
    hookTimeout: 30000,
    teardownTimeout: 30000
  },
  resolve: {
    alias: {
      '@': './src'
    }
  }
});
