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

// Vitest 4 removed `environmentMatchGlobs`; the node/DOM split is expressed
// as two inline projects that inherit this root config via `extends: true`.
const domInclude = [
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
  resolve: {
    conditions: ['source'],
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
      '@scripts': path.resolve(import.meta.dirname, '../../scripts'),
      '@tools': path.resolve(import.meta.dirname, '../../tools'),
      '@loadtest': path.resolve(import.meta.dirname, '../../loadtest'),
      'server-only': path.resolve(import.meta.dirname, './test/empty.ts'),
    },
  },
  test: {
    // Vitest 5 shares one filesystem module cache per workspace by default;
    // turbo runs every package's suite in parallel, so keep the cache
    // package-local to avoid concurrent-cache races.
    fsModuleCachePath: 'node_modules/.vitest-cache',
    pool: 'threads',
    maxWorkers,
    deps: {
      optimizer: {
        ssr: {
          enabled: true,
          include: ['@tabler/icons-react'],
        },
        client: {
          enabled: true,
          include: ['@tabler/icons-react', '@testing-library/react', '@testing-library/jest-dom'],
        },
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
        extends: true,
        test: {
          name: 'web-node',
          environment: 'node',
          setupFiles: ['./test/vitest.node-setup.ts'],
          include: ['test/**/*.test.{ts,tsx}', 'src/**/__tests__/**/*.test.{ts,tsx}'],
          exclude: domInclude,
        },
      },
      {
        extends: true,
        test: {
          name: 'web-dom',
          environment: 'happy-dom',
          setupFiles: ['./test/vitest.setup.ts'],
          include: domInclude,
        },
      },
    ],
  },
});
