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

// Playwright launcher. Sets the `server-only` stub in NODE_OPTIONS before the
// runner starts, so both the main process (test collection) and every worker
// can import server-side packages (e.g. @kestrel/ai/persistence).
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const stub = resolve(here, '../tests/e2e/server-only-stub.cjs');
const nodeOptions = [process.env.NODE_OPTIONS, `--require ${stub}`].filter(Boolean).join(' ');

const args = process.argv.slice(2);
if (args[0] === '--') args.shift();

const result = spawnSync('pnpm', ['exec', 'playwright', 'test', ...args], {
  cwd: resolve(here, '..'),
  stdio: 'inherit',
  env: { ...process.env, NODE_OPTIONS: nodeOptions },
});

process.exit(result.status ?? 1);
