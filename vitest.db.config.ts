import { defineConfig } from 'vitest/config';

process.loadEnvFile('.env.local');

export default defineConfig({
  test: {
    name: 'db',
    environment: 'node',
    include: ['tests/db/**/*.test.ts'],
    fileParallelism: false,
    hookTimeout: 30_000,
    testTimeout: 15_000,
  },
});
