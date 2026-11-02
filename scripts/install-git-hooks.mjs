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

// Wire the repository's tracked `.githooks/` directory into this clone.
//
// The secret scanner and other pre-commit checks live in `.githooks/` so they
// travel with the code. Git only runs them when `core.hooksPath` points there,
// which is a per-clone setting. `prepare` runs this on every `pnpm install`;
// outside a Git checkout (published tarballs, Docker build contexts without
// `.git`) it is a no-op.

import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');

function git(args) {
  return execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
}

try {
  const toplevel = resolve(git(['rev-parse', '--show-toplevel']));
  if (toplevel !== root) process.exit(0);
  git(['config', '--local', 'core.hooksPath', '.githooks']);
} catch {
  // Not a Git checkout (or Git is unavailable): nothing to wire.
  process.exit(0);
}
