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

// Install lefthook's Git hooks for this clone. `lefthook.yml` fans the
// pre-commit checks out in parallel; the secret scanner still lives in
// `.githooks/pre-commit` so it travels with the code. Outside a Git checkout
// (published tarballs, Docker build contexts without `.git`) this is a no-op.

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
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

  // Older clones pointed core.hooksPath at `.githooks`; lefthook installs into
  // `.git/hooks`, so clear the override before installing.
  try {
    git(['config', '--local', '--unset', 'core.hooksPath']);
  } catch {
    // Already unset.
  }

  const lefthook = resolve(root, 'node_modules/.bin/lefthook');
  if (existsSync(lefthook)) {
    execFileSync(lefthook, ['install'], { cwd: root, stdio: 'ignore' });
  }
} catch {
  // Not a Git checkout (or Git is unavailable): nothing to wire.
  process.exit(0);
}
