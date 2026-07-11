import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    // Use jsdom for component/integration tests, node for pure logic
    environment: 'jsdom',
  },
  resolve: {
    alias: {
      '@': `${__dirname}/src`,
    },
  },
});
