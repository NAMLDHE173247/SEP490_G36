import { defineConfig } from 'vitest/config';

// Tests live in ./tests (outside src) so the production `tsc` build is never
// affected. Secrets required by modules at import time are provided here.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    env: {
      JWT_SECRET: 'unit_test_jwt_secret_please_ignore',
      ENCRYPTION_KEY: 'unit_test_encryption_key_please_ignore',
    },
  },
});
