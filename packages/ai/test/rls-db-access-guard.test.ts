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

// Structural guard: every database access inside @kestrel/ai must go through
// `getDb()` from `src/runtime/db.ts`, which verifies that a tenant or admin
// AsyncLocalStorage scope is active before returning the client. Resolving the
// `DB` token directly from the container hands out the cached root pool and
// silently bypasses that check under the NOBYPASSRLS application role.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

function walkTsFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      results.push(...walkTsFiles(full));
    } else if (full.endsWith('.ts')) {
      results.push(full);
    }
  }
  return results;
}

describe('@kestrel/ai database access guard', () => {
  it('never calls container.resolve(DB) outside src/runtime/db.ts', () => {
    const srcRoot = join(__dirname, '..', 'src');
    const offenders: string[] = [];
    for (const file of walkTsFiles(srcRoot)) {
      const rel = relative(srcRoot, file).replace(/\\/g, '/');
      if (rel === 'runtime/db.ts') continue;
      const content = readFileSync(file, 'utf8');
      if (content.includes('container.resolve(DB)')) {
        offenders.push(rel);
      }
    }
    expect(offenders).toEqual([]);
  });
});
