#!/usr/bin/env node
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

// Run every static architecture/security guard concurrently. Each guard is a
// standalone Node script with its own exit code, so this only fans out and
// aggregates failures; it never weakens an individual check.

import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const guards = [
  'scripts/check-route-security.mjs',
  'scripts/check-env-contract.mjs',
  'scripts/check-doc-figures.mjs',
  'scripts/check-compose-images.mjs',
  'scripts/check-compose-reproducibility.mjs',
  'scripts/check-maintainability.mjs',
  'scripts/check-knip-config.mjs',
  'scripts/check-test-files.mjs',
];

const started = Date.now();
const results = await Promise.all(
  guards.map(
    (script) =>
      new Promise((resolvePromise) => {
        const proc = spawn(process.execPath, [resolve(root, script)], {
          cwd: root,
          stdio: ['ignore', 'pipe', 'pipe'],
        });
        let stdout = '';
        let stderr = '';
        proc.stdout.on('data', (chunk) => {
          stdout += chunk;
        });
        proc.stderr.on('data', (chunk) => {
          stderr += chunk;
        });
        proc.on('close', (code) => {
          resolvePromise({ script, code: code ?? 1, stdout, stderr });
        });
      }),
  ),
);

let failed = false;
for (const result of results) {
  if (result.code !== 0) {
    failed = true;
    process.stderr.write(
      `\n✗ ${result.script} failed (exit ${result.code}):\n${result.stderr || result.stdout}\n`,
    );
  }
}

if (failed) {
  process.exit(1);
}

process.stdout.write(`✓ All ${guards.length} static guards passed in ${Date.now() - started}ms.\n`);
