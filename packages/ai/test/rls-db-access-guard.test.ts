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

// Structural guard: every database access inside @kestrel/ai goes through
// `getDb()` from `src/runtime/db.ts`. That module delegates to `@kestrel/db`,
// the single owner of tenant/admin AsyncLocalStorage scope resolution. A
// direct import of the raw client from `@kestrel/db` would skip the
// package-local boundary and make future RLS changes easy to miss.

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

const RAW_DB_IMPORT = /\{[^}]*\b(?:getDb|getAdminDb)\b[^}]*\}\s*from\s*'@kestrel\/db'/s;

describe('@kestrel/ai database access guard', () => {
  it('imports the raw database client only from src/runtime/db.ts', () => {
    const srcRoot = join(__dirname, '..', 'src');
    const offenders: string[] = [];
    for (const file of walkTsFiles(srcRoot)) {
      const rel = relative(srcRoot, file).replace(/\\/g, '/');
      if (rel === 'runtime/db.ts') continue;
      const content = readFileSync(file, 'utf8');
      if (RAW_DB_IMPORT.test(content)) {
        offenders.push(rel);
      }
    }
    expect(offenders).toEqual([]);
  });
});
