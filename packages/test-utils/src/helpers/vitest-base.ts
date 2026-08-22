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

import { fileURLToPath } from 'node:url';

import { defineProject, type UserWorkspaceConfig } from 'vitest/config';

interface ProjectOptions {
  name: string;
  environment?: 'node' | 'jsdom';
  include?: string[];
  setupFiles?: string[];
  coverage?: {
    statements?: number;
    branches?: number;
    functions?: number;
    lines?: number;
  };
}

export function createProjectConfig(opts: ProjectOptions): UserWorkspaceConfig {
  const {
    name,
    environment = 'node',
    include = ['test/**/*.test.ts'],
    setupFiles = [],
    coverage,
  } = opts;

  return defineProject({
    test: {
      name,
      environment,
      include: [...include, 'src/**/*.test.ts'],
      setupFiles: [...setupFiles],
      server: {
        deps: {
          inline: ['server-only'],
        },
      },
      alias: {
        'server-only': fileURLToPath(new URL('../mocks/server-only.ts', import.meta.url)),
      },
    },
    ...(coverage
      ? {
          coverage: {
            provider: 'v8',
            include: ['src/**/*.ts'],
            exclude: ['src/**/*.test.ts', 'src/index.ts'],
            thresholds: {
              statements: coverage.statements ?? 50,
              branches: coverage.branches ?? 40,
              functions: coverage.functions ?? 50,
              lines: coverage.lines ?? 50,
            },
          },
        }
      : {}),
  } as UserWorkspaceConfig);
}
