import os from 'node:os';
import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { conditions: ['development'] },
  ssr: { resolve: { conditions: ['development'] } },
  test: {
    environment: 'node',
    env: {
      AI_PROVIDER: 'mock',
      NODE_ENV: 'test',
      // Keep test uploads out of the developer's ./data/files directory.
      FILES_DIR: path.join(os.tmpdir(), 'project-room-test-files'),
    },
    testTimeout: 15000,
    hookTimeout: 30000,
  },
});
