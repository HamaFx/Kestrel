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

// SPDX-License-Identifier: Apache-2.0

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const migrationPath = resolve(
  process.cwd(),
  '../../packages/db/drizzle/0038_phase3_rls_cutover.sql',
);
const runtimeMigratorPath = resolve(process.cwd(), 'scripts/migrate-runtime.mjs');

function extractEnabledTables(sql: string): string[] {
  return [...sql.matchAll(/ALTER TABLE\s+([a-z0-9_]+)\s+ENABLE ROW LEVEL SECURITY/gi)].map(
    (match) => match[1]!,
  );
}

describe('runtime migration multi-user policy', () => {
  it('enforces RLS and refuses to start if RLS is disabled', () => {
    const runtimeMigrator = readFileSync(runtimeMigratorPath, 'utf8');
    expect(runtimeMigrator).toContain('KESTREL_ENABLE_RLS must be 1; refusing to start.');
    expect(runtimeMigrator).not.toContain('DISABLE ROW LEVEL SECURITY');
  });

  it('preflights unsupported flags before opening the database client', () => {
    const runtimeMigrator = readFileSync(runtimeMigratorPath, 'utf8');
    const preflightIndex = runtimeMigrator.indexOf('const multiUserEnabled');
    expect(runtimeMigrator).toContain("registrationMode === 'open'");
    const clientIndex = runtimeMigrator.indexOf('const sql = postgres(');

    expect(runtimeMigrator).toContain('!multiUserEnabled || !rlsEnabled');
    expect(runtimeMigrator).toContain(
      'MULTI_USER_ENABLED=1 and KESTREL_ENABLE_RLS=1 are required',
    );
    expect(preflightIndex).toBeGreaterThan(-1);
    expect(clientIndex).toBeGreaterThan(-1);
    expect(preflightIndex).toBeLessThan(clientIndex);
  });
});
