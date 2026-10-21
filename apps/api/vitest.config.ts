import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { conditions: ['development'] },
  ssr: { resolve: { conditions: ['development'] } },
  test: { environment: 'node', env: { AI_PROVIDER: 'mock', NODE_ENV: 'test' }, testTimeout: 15000, hookTimeout: 30000 },
});
