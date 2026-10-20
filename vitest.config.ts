import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const exclude = ['tests/db/**', 'node_modules/**'];

export default defineConfig({
  test: {
    projects: [
      { plugins: [react()], test: { name: 'app', environment: 'jsdom', include: ['tests/app/**/*.test.{ts,tsx}'], exclude } },
      { test: { name: 'node', environment: 'node', include: ['tests/**/*.test.ts'], exclude: [...exclude, 'tests/app/**'] } },
    ],
  },
});
