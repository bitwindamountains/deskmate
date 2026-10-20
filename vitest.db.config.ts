import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

process.loadEnvFile('.env.local');

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    name: 'db',
    environment: 'node',
    include: ['tests/db/**/*.test.ts'],
    fileParallelism: false,
    hookTimeout: 30_000,
    testTimeout: 15_000,
  },
});
