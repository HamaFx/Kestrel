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

export default defineConfig({
  esbuild: { target: 'es2022' },
  resolve: {
    conditions: ['source'],
  },
  test: {
    // Vitest 5 shares one filesystem module cache per workspace by default;
    // turbo runs every package's suite in parallel, so keep the cache
    // package-local to avoid concurrent-cache races.
    fsModuleCachePath: 'node_modules/.vitest-cache',
    pool: 'forks',
    maxWorkers,
    environment: 'node',
    // B-09 / P-07 (audit 2026-10-18): this package keeps process-global test
    // singletons (`globalForMastraInstance`, `globalForMastraStorage`). Test
    // files must not share module state, so file isolation is a hard
    // requirement here — do NOT enable `isolate: false` for speed.
    isolate: true,
    include: ['test/**/*.test.ts', 'src/**/*.test.ts'],
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
        // Core orchestration must never silently regress.
        'src/mastra-v2/agents/xauusd/agent.ts': {
          statements: 26,
          branches: 30,
          functions: 49,
          lines: 26,
        },
      },
    },
    server: {
      deps: {
        inline: ['server-only'],
      },
    },
    alias: {
      'server-only': new URL('./test/__mocks__/server-only.ts', import.meta.url).pathname,
      '@ai': new URL('./src', import.meta.url).pathname,
    },
  },
});
