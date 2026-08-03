import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./client/src/test/setup.ts'],
    env: {
      // Fallback only — real DATABASE_URL (CI/local) always wins. Lets
      // tests that import server/db.ts (e.g. eid-auth tests) run without a
      // live database; pg.Pool does not connect eagerly, so an unreachable
      // placeholder is safe for tests that never issue a query.
      DATABASE_URL: process.env.DATABASE_URL || 'postgresql://user:password@localhost:5432/tidum_test_unreachable',
    },
    // tests/ er Playwright-specs (npm run test:e2e) — ikke vitest-tester
    exclude: ['**/node_modules/**', '**/dist/**', 'tests/**', 'tidsflyt-mobile/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
        '**/*.config.{ts,js}',
        '**/test/**',
        '**/*.d.ts',
      ],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './client/src'),
      '@shared': path.resolve(__dirname, './shared'),
    },
  },
});
