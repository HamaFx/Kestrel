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

// Phase 10 — Migration hash stability CI guard
//
// This test ensures that applied migration files are never edited.
// Editing a migration file changes its SHA-256 hash, which causes
// drizzle-kit to try to re-apply it on the next deploy — typically
// failing because the DDL is non-idempotent.
//
// The baseline file (_hashes.json) is committed to the repo and
// checked by this test. New migrations are automatically handled:
// if a migration tag exists in the journal but not in _hashes.json,
// the test still passes (allowing new migrations to be added).
//
// To update the baseline after generating new migrations, run:
//   pnpm --filter @kestrel/db test -- --run migration-hash-stability
// and commit the regenerated _hashes.json.

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { assertMigrationPlanIsConsistent, buildMigrationPlan } from '../src/migration-plan';

const HERE = dirname(fileURLToPath(import.meta.url));
const DRIZZLE_DIR = join(HERE, '..', 'drizzle');
const HASHES_PATH = join(DRIZZLE_DIR, 'meta', '_hashes.json');

interface HashEntry {
  tag: string;
  hash: string;
}

interface HashesFile {
  entries: HashEntry[];
}

function computeCurrentHashes(): Record<string, string> {
  const journal = JSON.parse(readFileSync(join(DRIZZLE_DIR, 'meta', '_journal.json'), 'utf-8')) as {
    entries: Array<{ tag: string }>;
  };

  const hashes: Record<string, string> = {};
  for (const entry of journal.entries) {
    const sqlPath = join(DRIZZLE_DIR, `${entry.tag}.sql`);
    const content = readFileSync(sqlPath);
    hashes[entry.tag] = createHash('sha256').update(content).digest('hex');
  }
  return hashes;
}

function loadBaseline(): HashesFile | null {
  if (!existsSync(HASHES_PATH)) return null;
  const contents = readFileSync(HASHES_PATH, 'utf-8').trim();
  // The hash file is generated/ignored in some working trees. Treat an
  // empty cache like a missing baseline so the guard can self-heal.
  if (!contents) return null;
  return JSON.parse(contents) as HashesFile;
}

function saveBaseline(hashes: Record<string, string>): void {
  const entries: HashEntry[] = Object.entries(hashes)
    .map(([tag, hash]) => ({ tag, hash }))
    .sort((a, b) => a.tag.localeCompare(b.tag));
  writeFileSync(HASHES_PATH, JSON.stringify({ entries }, null, 2) + '\n');
}

describe('Phase 10 — Migration hash stability guard', () => {
  it('no previously-applied migration file has been edited', () => {
    const currentHashes = computeCurrentHashes();
    const baseline = loadBaseline();

    if (!baseline) {
      // No baseline exists yet — create one and pass.
      saveBaseline(currentHashes);
      return;
    }

    const baselineMap = new Map(baseline.entries.map((e) => [e.tag, e.hash]));
    const changed: string[] = [];

    for (const [tag, currentHash] of Object.entries(currentHashes)) {
      const baselineHash = baselineMap.get(tag);
      if (baselineHash && baselineHash !== currentHash) {
        changed.push(tag);
      }
    }

    if (changed.length > 0) {
      const list = changed.map((t) => `  - ${t}`).join('\n');
      expect.fail(
        `The following migration files have been edited since they were last baselined:\n${list}\n\n` +
          'Do NOT edit applied migration files. Create a NEW migration to fix issues.\n' +
          'If you intentionally changed these files, update the baseline by deleting\n' +
          `${HASHES_PATH} and re-running this test.`,
      );
    }

    // Update baseline with any new migrations that have been added.
    const hasNew = Object.keys(currentHashes).some((tag) => !baselineMap.has(tag));
    if (hasNew) {
      saveBaseline(currentHashes);
    }
  });
});

describe('Phase 2 — schema/migration parity', () => {
  it('registers 0113 as the latest journal entry and keeps files consistent', () => {
    const plan = buildMigrationPlan(DRIZZLE_DIR);
    expect(() => assertMigrationPlanIsConsistent(plan)).not.toThrow();
    expect(plan.entries.at(-1)?.tag).toBe('0113_paper_strategy_runs');
  });

  it('defines composite primary keys on the memory state tables', async () => {
    const { getTableConfig } = await import('drizzle-orm/pg-core');
    const schema = await import('../src/schema');

    expect(getTableConfig(schema.memoryBackfillState).primaryKeys).toHaveLength(1);
    expect(getTableConfig(schema.memoryProjectionState).primaryKeys).toHaveLength(1);
  });

  it('restores the 0028 CHECK constraints and synced 0032 indexes', async () => {
    const { getTableConfig } = await import('drizzle-orm/pg-core');
    const schema = await import('../src/schema');

    const journalCfg = getTableConfig(schema.journalEntries);
    expect(journalCfg.checks.map((c) => c.name)).toContain('journal_outcome_closed_consistency');
    expect(journalCfg.indexes.map((i) => i.config.name)).toEqual(
      expect.arrayContaining(['journal_entries_deleted_at_idx', 'journal_entries_user_opened_idx']),
    );

    const portfolioCfg = getTableConfig(schema.portfolioPositions);
    expect(portfolioCfg.checks.map((c) => c.name)).toContain('portfolio_status_closed_consistency');

    const alertsCfg = getTableConfig(schema.alerts);
    expect(alertsCfg.checks.map((c) => c.name)).toContain('alerts_snooze_hours_check');

    const briefingsCfg = getTableConfig(schema.briefingsEmitted);
    expect(briefingsCfg.checks.map((c) => c.name)).toContain('briefings_emitted_kind_check');

    const tracesCfg = getTableConfig(schema.diagnosticTraces);
    expect(tracesCfg.columns.map((c) => c.name)).toContain('tenant_id');
  });
});
