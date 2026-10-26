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

// Vitest 4 removed `environmentMatchGlobs`; the node/jsdom split is now
// expressed as two inline projects that share the root Vite config.
const jsdomInclude = [
  '**/*.test.tsx',
  '**/hooks-*.test.ts',
  '**/csrf.test.ts',
  '**/storage.test.ts',
  '**/shiki-sanitization.test.ts',
  // PWA contracts: manifest/asset/install-preference checks read `localStorage`
  // and `matchMedia`, so they need a DOM environment.
  '**/pwa-*.test.ts',
];

export default defineConfig({
  plugins: [react()],
  esbuild: { target: 'esnext' },
  resolve: {
    conditions: ['source'],
    alias: {
      '@': path.resolve(__dirname, './src'),
      'server-only': path.resolve(__dirname, './test/empty.ts'),
    },
  },
  test: {
    // Vitest 5 shares one filesystem module cache per workspace by default;
    // turbo runs every package's suite in parallel, so keep the cache
    // package-local to avoid concurrent-cache races.
    fsModuleCachePath: 'node_modules/.vitest-cache',
    pool: 'forks',
    maxWorkers,
    setupFiles: ['./test/vitest.setup.ts'],
    deps: {
      optimizer: {
        ssr: { enabled: true },
        client: { enabled: true },
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
        // Recalibrated for the Vitest 4+ AST-aware V8 remapping, which is
        // more accurate than the legacy v8-to-istanbul numbers the previous
        // thresholds were set against.
        statements: 24,
        branches: 21,
        functions: 20,
        lines: 25,
      },
    },
    server: {
      deps: {
        inline: ['next-auth', '@auth/drizzle-adapter', /eventsource-parser/],
      },
    },
    projects: [
      {
        test: {
          name: 'web-node',
          environment: 'node',
          include: ['test/**/*.test.{ts,tsx}', 'src/**/__tests__/**/*.test.{ts,tsx}'],
          exclude: jsdomInclude,
        },
      },
      {
        test: {
          name: 'web-jsdom',
          environment: 'jsdom',
          include: jsdomInclude,
        },
      },
    ],
  },
});
