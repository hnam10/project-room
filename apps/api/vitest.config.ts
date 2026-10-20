import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { conditions: ['development'] },
  ssr: { resolve: { conditions: ['development'] } },
  test: { environment: 'node', testTimeout: 15000, hookTimeout: 30000 },
});
