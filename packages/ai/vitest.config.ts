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

import { defineConfig } from 'vitest/config';

const maxWorkers = process.env.CI ? 2 : Math.max(2, Math.floor(os.availableParallelism() / 2));

// These suites touch process-wide Mastra singletons, env snapshots, module
// caches, or shared circuit-breaker state. They must not share a module graph
// with other files.
const isolatedInclude = [
  'test/mastra-*.test.ts',
  'test/telemetry*.test.ts',
  'test/model-circuit-breaker.test.ts',
  'test/env-fallback-keys.test.ts',
  'test/alerts-claim-postgres.test.ts',
  'test/phase2-concurrency.test.ts',
];

export default defineConfig({
  resolve: {
    conditions: ['source'],
    alias: {
      'server-only': new URL('./test/__mocks__/server-only.ts', import.meta.url).pathname,
      '@ai': new URL('./src', import.meta.url).pathname,
    },
  },
  test: {
    // Vitest 5 shares one filesystem module cache per workspace by default;
    // turbo runs every package's suite in parallel, so keep the cache
    // package-local to avoid concurrent-cache races.
    fsModuleCachePath: 'node_modules/.vitest-cache',
    pool: 'threads',
    maxWorkers,
    environment: 'node',
    deps: {
      optimizer: {
        ssr: { enabled: true },
      },
    },
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/index.ts'],
      thresholds: {
        // Recalibrated for the Vitest 4+ AST-aware V8 remapping, which is
        // more accurate than the legacy v8-to-istanbul numbers the previous
        // thresholds were set against. Global floor currently ~65% stmts/lines.
        statements: 64,
        branches: 55,
        functions: 69,
        lines: 66,
      },
    },
    server: {
      deps: {
        inline: ['server-only'],
      },
    },
    projects: [
      {
        extends: true,
        test: {
          name: 'ai-fast',
          // The suite mocks modules and mutates process env at file scope, so
          // keep file isolation. The fast/isolated split still pins the
          // singleton-heavy files to an explicit project.
          isolate: true,
          include: ['test/**/*.test.ts', 'src/**/*.test.ts'],
          exclude: isolatedInclude,
        },
      },
      {
        extends: true,
        test: {
          name: 'ai-isolated',
          isolate: true,
          include: isolatedInclude,
        },
      },
    ],
  },
});
