import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const exclude = ['tests/db/**', 'node_modules/**'];

const resolve = { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } };

export default defineConfig({
  test: {
    projects: [
      { plugins: [react()], resolve, test: { name: 'app', environment: 'jsdom', include: ['tests/app/**/*.test.{ts,tsx}'], exclude } },
      { resolve, test: { name: 'node', environment: 'node', include: ['tests/**/*.test.ts'], exclude: [...exclude, 'tests/app/**'] } },
    ],
  },
});
