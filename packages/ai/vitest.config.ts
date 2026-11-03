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

// Pure, stateless suites: they can share one module graph without leaking
// state between files. Files that call `vi.mock` or mutate `process.env`
// stay in the isolated project, because the module graph is shared here.
const fastPureInclude = [
  'test/alert-decide.test.ts',
  'test/alert-simulate.test.ts',
  'test/byok-providers.test.ts',
  'test/canonical-evidence.test.ts',
  'test/committee.test.ts',
  'test/committee-stale-grounding.test.ts',
  'test/contract-tool-outputs.test.ts',
  'test/external-content.test.ts',
  'test/indirect-content-guardrail.test.ts',
  'test/mastra-router.test.ts',
  'test/opinion-verifier.test.ts',
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
    server: {
      deps: {
        inline: ['server-only'],
      },
    },
    // Keep `include` out of the root test block: with `projects` that use
    // `extends: true`, Vitest 5 merges a root include into every project and
    // runs the same files once per project.
    projects: [
      {
        extends: true,
        test: {
          name: 'ai-fast',
          isolate: false,
          include: fastPureInclude,
        },
      },
      {
        extends: true,
        test: {
          name: 'ai-isolated',
          isolate: true,
          include: ['test/**/*.test.ts'],
          exclude: fastPureInclude,
        },
      },
    ],
  },
});
