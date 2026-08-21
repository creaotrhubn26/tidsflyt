import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    // Many server-side test files run integration tests against the real,
    // shared production database (no test DB exists in this environment)
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
    },
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
