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

// R11 — migration preflight guards.
//
// Drizzle applies a migration only when its `when` is strictly newer than the
// newest `created_at` recorded in drizzle.__drizzle_migrations; it does not
// follow journal order. These tests cover the three failure modes the audit
// found: duplicate `when` values, a pending entry that would be skipped, and
// an applied migration whose file was edited afterwards.

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import {
  assertMigrationPlanIsConsistent,
  assertMigrationPlanWillApply,
  auditMigrationPlan,
  buildMigrationPlan,
  collectRequiredSchemaObjects,
  findDuplicateWhenGroups,
  HISTORICAL_DUPLICATE_WHEN_TAGS,
  type MigrationPlan,
  type MigrationPlanEntry,
} from '../src/migration-plan';

const HERE = dirname(fileURLToPath(import.meta.url));
const DRIZZLE_DIR = join(HERE, '..', 'drizzle');
const HISTORICAL_WHEN = 1792900506784;

interface FixtureEntry {
  tag: string;
  when?: number;
}

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function fixture(entries: FixtureEntry[]): string {
  const dir = mkdtempSync(join(tmpdir(), 'kestrel-migration-preflight-'));
  dirs.push(dir);
  mkdirSync(join(dir, 'meta'));
  writeFileSync(join(dir, 'meta', '_journal.json'), JSON.stringify({ entries }));
  for (const entry of entries) {
    writeFileSync(join(dir, `${entry.tag}.sql`), `SELECT '${entry.tag}';`);
  }
  return dir;
}

function entry(plan: MigrationPlan, tag: string): MigrationPlanEntry {
  const found = plan.entries.find((candidate) => candidate.tag === tag);
  if (!found) throw new Error(`Fixture is missing journal entry ${tag}`);
  return found;
}

const historicalTrio: FixtureEntry[] = [
  { tag: '0111_custom_agent_runs', when: HISTORICAL_WHEN },
  { tag: '0112_backtesting_sweeps', when: HISTORICAL_WHEN },
  { tag: '0113_paper_strategy_runs', when: HISTORICAL_WHEN },
];

describe('R11 — duplicate journal timestamps', () => {
  it('allows only the grandfathered 0111–0113 group', () => {
    const plan = buildMigrationPlan(
      fixture([
        ...historicalTrio,
        { tag: '0120_mastra_storage_schema', when: HISTORICAL_WHEN + 1 },
      ]),
    );

    const groups = findDuplicateWhenGroups(plan.entries);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.allowed).toBe(true);
    expect(groups[0]?.tags).toEqual([...HISTORICAL_DUPLICATE_WHEN_TAGS]);
    expect(() => assertMigrationPlanIsConsistent(plan)).not.toThrow();
  });

  it('rejects a new entry that reuses the historical timestamp', () => {
    const plan = buildMigrationPlan(
      fixture([...historicalTrio, { tag: '0121_new_migration', when: HISTORICAL_WHEN }]),
    );

    expect(findDuplicateWhenGroups(plan.entries)[0]?.allowed).toBe(false);
    expect(() => assertMigrationPlanIsConsistent(plan)).toThrow(/0121_new_migration/);
    expect(() => assertMigrationPlanIsConsistent(plan)).toThrow(
      /Duplicate migration journal 'when' timestamps/,
    );
  });

  it('rejects two brand-new entries sharing a timestamp', () => {
    const plan = buildMigrationPlan(
      fixture([
        { tag: '0121_new_a', when: 1800000000000 },
        { tag: '0122_new_b', when: 1800000000000 },
      ]),
    );

    expect(() => assertMigrationPlanIsConsistent(plan)).toThrow(/0121_new_a, 0122_new_b/);
  });

  it('rejects an entry without a numeric when', () => {
    const plan = buildMigrationPlan(fixture([{ tag: '0121_no_when' }]));
    expect(() => assertMigrationPlanIsConsistent(plan)).toThrow(/without a numeric 'when'/);
  });
});

describe('R11 — applied-migration preflight', () => {
  it('rejects a pending entry whose when is not newer than the newest applied row', () => {
    const plan = buildMigrationPlan(
      fixture([
        { tag: '0110_old', when: 1000 },
        { tag: '0121_stale', when: 900 },
      ]),
    );
    const applied = [{ hash: entry(plan, '0110_old').hash, createdAt: 1000 }];

    const audit = auditMigrationPlan(plan, applied);
    expect(audit.newestAppliedAt).toBe(1000);
    expect(audit.appliedCount).toBe(1);
    expect(audit.wouldBeSkipped.map((status) => status.tag)).toEqual(['0121_stale']);
    expect(audit.pending).toEqual([]);

    expect(() => assertMigrationPlanWillApply(plan, applied)).toThrow(/silently skipped/);
    expect(() => assertMigrationPlanWillApply(plan, applied)).toThrow(/0121_stale \(when=900\)/);
  });

  it('accepts a pending entry strictly newer than the newest applied row', () => {
    const plan = buildMigrationPlan(
      fixture([
        { tag: '0110_old', when: 1000 },
        { tag: '0121_newer', when: 1001 },
      ]),
    );
    const applied = [{ hash: entry(plan, '0110_old').hash, createdAt: 1000 }];

    const audit = assertMigrationPlanWillApply(plan, applied);
    expect(audit.pending.map((status) => status.tag)).toEqual(['0121_newer']);
    expect(audit.wouldBeSkipped).toEqual([]);
  });

  it('accepts a fresh database, including the historical duplicate group', () => {
    const plan = buildMigrationPlan(fixture([...historicalTrio]));

    const audit = assertMigrationPlanWillApply(plan, []);
    expect(audit.newestAppliedAt).toBeNull();
    expect(audit.pending).toHaveLength(3);
  });

  it('classifies an applied migration whose file changed as applied-modified', () => {
    const plan = buildMigrationPlan(fixture([{ tag: '0113_paper_strategy_runs', when: 5000 }]));
    const applied = [{ hash: 'f'.repeat(64), createdAt: 5000 }];

    const audit = auditMigrationPlan(plan, applied);
    expect(audit.statuses[0]?.state).toBe('applied-modified');
    expect(audit.modifiedApplied.map((status) => status.tag)).toEqual(['0113_paper_strategy_runs']);

    expect(() => assertMigrationPlanWillApply(plan, applied)).toThrow(/edited after they ran/);
  });

  it('keeps an unmodified applied entry applied even when newer rows exist', () => {
    const plan = buildMigrationPlan(
      fixture([
        { tag: '0110_old', when: 1000 },
        { tag: '0120_latest', when: 2000 },
      ]),
    );
    const applied = [
      { hash: entry(plan, '0110_old').hash, createdAt: 1000 },
      { hash: entry(plan, '0120_latest').hash, createdAt: 2000 },
    ];

    const audit = assertMigrationPlanWillApply(plan, applied);
    expect(audit.appliedCount).toBe(2);
    expect(audit.modifiedApplied).toEqual([]);
    expect(audit.wouldBeSkipped).toEqual([]);
  });

  it('reports unknown applied hashes without rejecting the plan', () => {
    const plan = buildMigrationPlan(fixture([{ tag: '0121_new', when: 2000 }]));
    const applied = [
      { hash: entry(plan, '0121_new').hash, createdAt: 2000 },
      { hash: 'a'.repeat(64), createdAt: 3000 },
    ];

    const audit = assertMigrationPlanWillApply(plan, applied);
    expect(audit.unknownAppliedHashes).toEqual(['a'.repeat(64)]);
  });
});

describe('R11 — repository migration folders and schema inventory', () => {
  it('accepts the live v1 folder layout and orders it by name', () => {
    const plan = buildMigrationPlan(DRIZZLE_DIR);
    expect(plan.layout).toBe('folders');
    expect(() => assertMigrationPlanIsConsistent(plan)).not.toThrow();
    // Same-second migrations are disambiguated by the numeric prefix retained
    // in the folder suffix, so name order must equal the derived timestamp order.
    const names = plan.entries.map((entry) => entry.tag);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
    expect(plan.entries.length).toBeGreaterThan(120);
  });

  it('collects the tables, columns and indexes the reconcile check verifies', async () => {
    const schema = await import('../src/schema');
    const required = collectRequiredSchemaObjects(schema as unknown as Record<string, unknown>);

    expect(required.tables.length).toBeGreaterThan(40);
    expect(required.tables).toContain('alerts');
    expect(required.tables).toContain('journal_entries');
    expect(required.columns).toContain('alerts.delivery_claimed_at');
    expect(required.indexes).toContain('alerts_delivery_claimed_at_idx');
    expect(required.indexes).toContain('chat_threads_one_briefings_per_user_idx');
  });
});
