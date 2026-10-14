/**
 * Copyright 2026 Kestrel
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import os from 'node:os';
import path from 'node:path';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const maxWorkers = process.env.CI ? 2 : Math.max(2, Math.floor(os.availableParallelism() / 2));

export default defineConfig({
  plugins: [react()],
  esbuild: { target: 'esnext' },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      'server-only': path.resolve(__dirname, './test/empty.ts'),
    },
  },
  test: {
    environment: 'node',
    environmentMatchGlobs: [
      ['**/*.test.tsx', 'jsdom'],
      ['**/hooks-*.test.ts', 'jsdom'],
      ['**/csrf.test.ts', 'jsdom'],
      ['**/storage.test.ts', 'jsdom'],
      ['**/shiki-sanitization.test.ts', 'jsdom'],
    ],
    pool: 'forks',
    maxWorkers,
    include: ['test/**/*.test.{ts,tsx}', 'src/**/__tests__/**/*.test.{ts,tsx}'],
    setupFiles: ['./test/vitest.setup.ts'],
    deps: {
      optimizer: {
        ssr: { enabled: true },
        web: { enabled: true },
      },
    },
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/*.test.tsx',
        'src/index.ts',
        'src/app/**/layout.tsx',
        'src/app/**/loading.tsx',
        'src/app/**/page.tsx',
      ],
      thresholds: {
        statements: 50,
        branches: 50,
        functions: 50,
        lines: 50,
      },
    },
    server: {
      deps: {
        inline: ['next-auth', '@auth/drizzle-adapter', /eventsource-parser/],
      },
    },
  },
});
