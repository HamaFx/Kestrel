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
  resolve: {
    conditions: ['source'],
    alias: {
      'server-only': new URL('./test/__mocks__/server-only.ts', import.meta.url).pathname,
    },
  },
  test: {
    fsModuleCachePath: 'node_modules/.vitest-cache',
    pool: 'forks',
    maxWorkers,
    environment: 'node',
    include: ['test/**/*.test.ts', 'test/**/*.test.tsx'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      exclude: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
      thresholds: {
        statements: 65,
        branches: 65,
        functions: 65,
        lines: 65,
      },
    },
  },
});
