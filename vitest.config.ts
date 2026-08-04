import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./tests/setup-env.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // The `server-only` package throws unconditionally unless the bundler sets the
      // `react-server` export condition (which Next.js does, but Vitest's plain Node
      // environment does not). Alias it to the package's own no-op `empty.js` (the file
      // it exports under the `react-server` condition) so server-only modules can be
      // imported directly in integration tests without pulling in a real RSC runtime.
      'server-only': path.resolve(__dirname, './node_modules/server-only/empty.js'),
    },
  },
});
