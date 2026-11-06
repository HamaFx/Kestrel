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

import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { getTableConfig, type PgTable } from 'drizzle-orm/pg-core';

/**
 * Migration layouts Kestrel understands.
 *
 * - `folders` — Drizzle v1 / drizzle-kit v3: one subfolder per migration
 *   containing `migration.sql` (and `snapshot.json`). The migrator applies
 *   every missing folder and matches applied rows by folder name.
 * - `journal` — the pre-v1 flat layout. Retained only so fixtures and older
 *   checkouts still produce a useful preflight.
 */
type MigrationLayout = 'journal' | 'folders';

interface MigrationEntry {
  tag: string;
  when?: number;
  breakpoints?: number;
}

export interface MigrationPlanEntry extends MigrationEntry {
  /** SQL path relative to the migrations folder. */
  file: string;
  hash: string;
  /** v3 folder name, when the plan was built from folders. */
  folder?: string;
}

export interface MigrationPlan {
  layout: MigrationLayout;
  entries: MigrationPlanEntry[];
  /** SQL files in the migrations root (folders layout) or absent from the journal. */
  unjournaledFiles: string[];
  missingTags: string[];
}

/**
 * The only journal tags permitted to share a `when` timestamp.
 *
 * `0111`–`0113` were generated in a single drizzle-kit batch and all three
 * recorded `when=1792900506784` before this guard existed. Their timestamps
 * cannot be rewritten: every database that already applied them stores that
 * value as `drizzle.__drizzle_migrations.created_at`.
 *
 * The v3 folder layout disambiguates same-second migrations by folder name,
 * so this list only constrains the legacy journal layout. Do not add to it.
 */
export const HISTORICAL_DUPLICATE_WHEN_TAGS: readonly string[] = Object.freeze([
  '0111_custom_agent_runs',
  '0112_backtesting_sweeps',
  '0113_paper_strategy_runs',
]);

interface DuplicateWhenGroup {
  when: number;
  tags: string[];
  /** True only for a duplicate group made up entirely of grandfathered tags. */
  allowed: boolean;
}

export function findDuplicateWhenGroups(entries: readonly MigrationEntry[]): DuplicateWhenGroup[] {
  const tagsByWhen = new Map<number, string[]>();
  for (const entry of entries) {
    if (typeof entry.when !== 'number') continue;
    const tags = tagsByWhen.get(entry.when);
    if (tags) tags.push(entry.tag);
    else tagsByWhen.set(entry.when, [entry.tag]);
  }

  const allowance = new Set(HISTORICAL_DUPLICATE_WHEN_TAGS);
  const groups: DuplicateWhenGroup[] = [];
  for (const [when, tags] of tagsByWhen) {
    if (tags.length < 2) continue;
    groups.push({ when, tags, allowed: tags.every((tag) => allowance.has(tag)) });
  }
  return groups.sort((a, b) => a.when - b.when);
}

export interface AppliedMigration {
  hash: string;
  /** Legacy `created_at` millis. Null/absent when the column is not populated. */
  createdAt?: number | null;
  /** v1 folder name recorded by the migrator. Null for rows backfilled from v0. */
  name?: string | null;
}

type MigrationEntryState = 'applied' | 'applied-modified' | 'pending' | 'would-be-skipped';

interface MigrationEntryStatus {
  tag: string;
  when: number;
  state: MigrationEntryState;
}

interface MigrationAppliedAudit {
  /** `MAX(created_at)` in `drizzle.__drizzle_migrations`, or null when nothing is applied. */
  newestAppliedAt: number | null;
  /** Entries whose hash or folder name is recorded in the database. */
  appliedCount: number;
  /** Applied hashes the current plan does not contain. */
  unknownAppliedHashes: string[];
  statuses: MigrationEntryStatus[];
  /** Applied migrations whose file hash changed since they ran; drizzle never re-runs them. */
  modifiedApplied: MigrationEntryStatus[];
  /**
   * Journal-only: entries drizzle v0 would silently skip. Always empty for the
   * v1 folder layout, where migrations are matched by name.
   */
  wouldBeSkipped: MigrationEntryStatus[];
  pending: MigrationEntryStatus[];
}

/** Parse the 14-digit UTC prefix of a v3 migration folder. */
function folderMillis(folder: string): number {
  const match = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/.exec(folder);
  if (!match) {
    throw new Error(
      `Migration folder '${folder}' does not start with a 14-digit UTC timestamp ` +
        '(YYYYMMDDHHMMSS). Drizzle orders and dates folders by that prefix.',
    );
  }
  return Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4]),
    Number(match[5]),
    Number(match[6]),
  );
}

function sha256File(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function buildFromJournal(migrationsDir: string): MigrationPlan {
  const journalPath = join(migrationsDir, 'meta', '_journal.json');
  const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as {
    entries?: MigrationEntry[];
  };
  const entries = journal.entries ?? [];
  const sqlFiles = readdirSync(migrationsDir).filter((file) => file.endsWith('.sql'));
  const plan: MigrationPlanEntry[] = [];
  const missingTags: string[] = [];

  for (const entry of entries) {
    const file = sqlFiles.find((candidate) => candidate.startsWith(`${entry.tag}.`));
    if (!file) {
      missingTags.push(entry.tag);
      continue;
    }
    plan.push({
      ...entry,
      file,
      hash: sha256File(join(migrationsDir, file)),
    });
  }

  const tags = new Set(entries.map((entry) => entry.tag));
  const unjournaledFiles = sqlFiles.filter(
    (file) => ![...tags].some((tag) => file.startsWith(`${tag}.`)),
  );

  return { layout: 'journal', entries: plan, unjournaledFiles, missingTags };
}

function buildFromFolders(migrationsDir: string): MigrationPlan {
  const folders = readdirSync(migrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
    .map((entry) => entry.name)
    .filter((name) => existsSync(join(migrationsDir, name, 'migration.sql')))
    .sort((a, b) => a.localeCompare(b));

  if (folders.length === 0) {
    throw new Error(
      `No migration folders found at ${migrationsDir}. Expected ` +
        '<YYYYMMDDHHMMSS>_<name>/migration.sql subfolders (drizzle-kit v3 layout).',
    );
  }

  const entries: MigrationPlanEntry[] = folders.map((folder) => ({
    tag: folder,
    folder,
    when: folderMillis(folder),
    breakpoints: 1,
    file: join(folder, 'migration.sql'),
    hash: sha256File(join(migrationsDir, folder, 'migration.sql')),
  }));

  const unjournaledFiles = readdirSync(migrationsDir).filter((file) => file.endsWith('.sql'));

  return { layout: 'folders', entries, unjournaledFiles, missingTags: [] };
}

export function buildMigrationPlan(migrationsDir: string): MigrationPlan {
  if (existsSync(join(migrationsDir, 'meta', '_journal.json'))) {
    return buildFromJournal(migrationsDir);
  }
  return buildFromFolders(migrationsDir);
}

export function assertMigrationPlanIsConsistent(plan: MigrationPlan): void {
  if (plan.missingTags.length > 0) {
    throw new Error(`Missing migration files: ${plan.missingTags.join(', ')}`);
  }
  if (plan.unjournaledFiles.length > 0) {
    const where = plan.layout === 'folders' ? 'the migrations root' : 'the journal';
    throw new Error(
      `Migration SQL files are not tracked by ${where}: ${plan.unjournaledFiles.join(', ')}`,
    );
  }

  const missingWhen = plan.entries
    .filter((entry) => typeof entry.when !== 'number')
    .map((entry) => entry.tag);
  if (missingWhen.length > 0) {
    throw new Error(
      `Migration entries without a numeric 'when' timestamp: ${missingWhen.join(', ')}`,
    );
  }

  if (plan.layout === 'folders') {
    // Drizzle orders folder migrations by name. The 14-digit prefix carries the
    // timestamp, so a lexicographic sort must reproduce journal order; without
    // that, `migrate` runs a later migration before its parent.
    const sorted = [...plan.entries].sort((a, b) => a.tag.localeCompare(b.tag));
    const outOfOrder = plan.entries.find((entry, index) => sorted[index]?.tag !== entry.tag);
    if (outOfOrder) {
      throw new Error(
        `Migration folders are not in lexicographic order at '${outOfOrder.tag}'. Drizzle runs ` +
          'folders in name order; regenerate the folder name so its timestamp and suffix sort ' +
          'after its parent.',
      );
    }
    return;
  }

  const unexpected = findDuplicateWhenGroups(plan.entries).filter((group) => !group.allowed);
  if (unexpected.length > 0) {
    const described = unexpected
      .map((group) => `${group.when} shared by ${group.tags.join(', ')}`)
      .join('; ');
    throw new Error(
      `Duplicate migration journal 'when' timestamps: ${described}. The only permitted duplicate ` +
        `is the historical ${HISTORICAL_DUPLICATE_WHEN_TAGS.join(', ')} group. Drizzle v0 applies ` +
        'an entry only when its `when` is newer than the newest applied `created_at`, so a new ' +
        'duplicate can be skipped silently. Regenerate the migration ' +
        '(`pnpm --filter @kestrel/db migrate:gen`) so its `when` is unique and newer.',
    );
  }
}

/**
 * Classify every plan entry against what `drizzle.__drizzle_migrations`
 * already records. Pure so the CLI scripts and tests share one decision table.
 */
export function auditMigrationPlan(
  plan: MigrationPlan,
  applied: readonly AppliedMigration[],
): MigrationAppliedAudit {
  const appliedHashes = new Set(applied.map((row) => row.hash));

  let newestAppliedAt: number | null = null;
  for (const row of applied) {
    if (typeof row.createdAt !== 'number') continue;
    if (newestAppliedAt === null || row.createdAt > newestAppliedAt) {
      newestAppliedAt = row.createdAt;
    }
  }

  const byName = new Map<string, AppliedMigration>();
  for (const row of applied) {
    if (row.name) byName.set(row.name, row);
  }

  const statuses: MigrationEntryStatus[] = plan.entries.map((entry) => {
    const when = entry.when;
    if (typeof when !== 'number') {
      throw new Error(
        `Migration ${entry.tag} has no numeric timestamp; drizzle cannot order it. Regenerate the ` +
          'migration.',
      );
    }

    if (plan.layout === 'folders') {
      const named = byName.get(entry.tag);
      if (named) {
        return {
          tag: entry.tag,
          when,
          state: named.hash === entry.hash ? 'applied' : 'applied-modified',
        };
      }
      // A row written before the folder-name backfill has no `name`; its hash
      // is still authoritative and `migrate()` fills the name on the next run.
      return {
        tag: entry.tag,
        when,
        state: appliedHashes.has(entry.hash) ? 'applied' : 'pending',
      };
    }

    const appliedWhens = new Set(
      applied
        .map((row) => row.createdAt)
        .filter((value): value is number => typeof value === 'number'),
    );

    let state: MigrationEntryState = 'pending';
    if (appliedHashes.has(entry.hash)) {
      state = 'applied';
    } else if (appliedWhens.has(when)) {
      // A row exists at this entry's timestamp but with a different hash: the
      // migration ran and its file has since been edited.
      state = 'applied-modified';
    } else if (newestAppliedAt !== null && when <= newestAppliedAt) {
      state = 'would-be-skipped';
    }

    return { tag: entry.tag, when, state };
  });

  const planHashes = new Set(plan.entries.map((entry) => entry.hash));
  const unknownAppliedHashes = [...appliedHashes].filter((hash) => !planHashes.has(hash));

  const byState = (state: MigrationEntryState) =>
    statuses.filter((status) => status.state === state);

  return {
    newestAppliedAt,
    appliedCount: byState('applied').length,
    unknownAppliedHashes,
    statuses,
    modifiedApplied: byState('applied-modified'),
    wouldBeSkipped: byState('would-be-skipped'),
    pending: byState('pending'),
  };
}

/**
 * Refuse to run a plan that the migrator would misapply.
 *
 * v0 compared each entry's `when` against the newest `created_at` and skipped
 * anything older, which is why `would-be-skipped` is fatal there. v1 matches
 * applied migrations by folder name and applies every missing one, so only
 * modified applied migrations are fatal.
 *
 * Returns the audit so callers can report counts; throws otherwise.
 */
export function assertMigrationPlanWillApply(
  plan: MigrationPlan,
  applied: readonly AppliedMigration[],
): MigrationAppliedAudit {
  const audit = auditMigrationPlan(plan, applied);
  const problems: string[] = [];

  if (audit.modifiedApplied.length > 0) {
    problems.push(
      `${audit.modifiedApplied.length} applied migration(s) were edited after they ran; drizzle ` +
        'stores hashes and will never re-run them:\n' +
        audit.modifiedApplied
          .map((entry) => `  - ${entry.tag} (recorded at ${entry.when})`)
          .join('\n') +
        '\nCreate a NEW migration instead of editing an applied one.',
    );
  }

  if (plan.layout === 'journal' && audit.wouldBeSkipped.length > 0) {
    problems.push(
      `${audit.wouldBeSkipped.length} migration(s) would be silently skipped because their \`when\` ` +
        `is not newer than the newest applied \`created_at\` (${audit.newestAppliedAt}):\n` +
        audit.wouldBeSkipped.map((entry) => `  - ${entry.tag} (when=${entry.when})`).join('\n') +
        '\nDrizzle v0 applies migrations by `when` timestamp, not journal order. Regenerate the ' +
        'migration so its `when` is strictly newer, or restore the original journal timestamp.',
    );
  }

  if (problems.length > 0) {
    throw new Error(`Migration preflight failed — refusing to apply:\n${problems.join('\n\n')}`);
  }
  return audit;
}

interface RequiredSchemaObjects {
  tables: string[];
  /** `table.column` keys, sorted. */
  columns: string[];
  indexes: string[];
}

function isDrizzleTable(value: unknown): value is PgTable {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as Record<symbol, unknown>)[Symbol.for('drizzle:IsDrizzleTable')] === true
  );
}

/**
 * Collect the database objects the schema module declares. Reconciliation uses
 * this as the source of truth for what the migrations are supposed to have
 * created, instead of the hand-maintained (and once empty) lists it used before.
 */
export function collectRequiredSchemaObjects(
  schemaModule: Record<string, unknown>,
): RequiredSchemaObjects {
  const tables = new Set<string>();
  const columnKeys = new Set<string>();
  const indexes = new Set<string>();

  for (const value of Object.values(schemaModule)) {
    if (!isDrizzleTable(value)) continue;
    const config = getTableConfig(value);
    if (config.schema && config.schema !== 'public') continue;

    tables.add(config.name);
    for (const column of config.columns) columnKeys.add(`${config.name}.${column.name}`);
    for (const index of config.indexes) {
      if (index.config.name) indexes.add(index.config.name);
    }
  }

  const columns = [...columnKeys].sort();
  return {
    tables: [...tables].sort(),
    columns,
    indexes: [...indexes].sort(),
  };
}
