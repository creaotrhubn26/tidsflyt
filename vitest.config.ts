import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    // Many server-side test files run integration tests against an explicitly
    // supplied, shared development database (never a production database)
    // and assert GLOBAL invariants — e.g. "removing the only role.manage
    // holder is blocked" — that the code under test deliberately checks
    // system-wide, not scoped to one test file's own fixtures. Vitest's
    // default file-level parallelism lets two such files race on that
    // real, shared state (one file temporarily removing role.manage from
    // the real super_admin role while another asserts it's the sole
    // holder), causing intermittent false failures and, worse, a real
    // (if brief) window where a live account loses real access. No CI
    // pipeline currently depends on parallel speed, so correctness wins.
    fileParallelism: false,
    setupFiles: ['./client/src/test/setup.ts'],
    env: {
      // Fallback only — real DATABASE_URL (CI/local) always wins. Lets
      // tests that import server/db.ts (e.g. eid-auth tests) run without a
      // live database; pg.Pool does not connect eagerly, so an unreachable
      // placeholder is safe for tests that never issue a query.
      DATABASE_URL: process.env.DATABASE_URL || 'postgresql://user:password@localhost:5432/tidum_test_unreachable',
      // Legacy route tests sign with JWT_SECRET. Keep the test-only values
      // aligned while production code requires AUTH_JWT_SECRET explicitly.
      AUTH_JWT_SECRET: process.env.AUTH_JWT_SECRET || process.env.JWT_SECRET || process.env.SESSION_SECRET || 'test-auth-jwt-secret',
      JWT_SECRET: process.env.JWT_SECRET || process.env.AUTH_JWT_SECRET || process.env.SESSION_SECRET || 'test-auth-jwt-secret',
      SESSION_SECRET: process.env.SESSION_SECRET || 'test-session-secret-for-vitest',
      EMAIL_MAGIC_LINK_SECRET: process.env.EMAIL_MAGIC_LINK_SECRET || 'test-email-magic-link-secret',
      CSRF_SECRET: process.env.CSRF_SECRET || 'test-csrf-secret-for-vitest',
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
