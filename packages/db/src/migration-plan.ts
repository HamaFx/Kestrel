import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { getTableConfig, type PgTable } from 'drizzle-orm/pg-core';

export interface MigrationEntry {
  tag: string;
  when?: number;
  breakpoints?: number;
}

export interface MigrationPlanEntry extends MigrationEntry {
  file: string;
  hash: string;
}

export interface MigrationPlan {
  entries: MigrationPlanEntry[];
  unjournaledFiles: string[];
  missingTags: string[];
}

/**
 * The only journal tags permitted to share a `when` timestamp.
 *
 * `0111`–`0113` were generated in a single drizzle-kit batch and all three
 * recorded `when=1792900506784` before this guard existed. Their timestamps
 * cannot be rewritten: every database that already applied them stores that
 * value as `drizzle.__drizzle_migrations.created_at`, and rewriting the
 * journal would make the preflight disagree with that history.
 *
 * Do not add to this list — and do not copy it anywhere that could be widened
 * independently. A new duplicate `when` makes drizzle skip entries silently,
 * so `assertMigrationPlanIsConsistent` fails for any duplicate group whose
 * tags are not all listed here.
 */
export const HISTORICAL_DUPLICATE_WHEN_TAGS: readonly string[] = Object.freeze([
  '0111_custom_agent_runs',
  '0112_backtesting_sweeps',
  '0113_paper_strategy_runs',
]);

export interface DuplicateWhenGroup {
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
  /** `created_at` from `drizzle.__drizzle_migrations`; drizzle records the journal entry's `when`. */
  createdAt: number;
}

type MigrationEntryState = 'applied' | 'applied-modified' | 'pending' | 'would-be-skipped';

interface MigrationEntryStatus {
  tag: string;
  when: number;
  state: MigrationEntryState;
}

export interface MigrationAppliedAudit {
  /** `MAX(created_at)` in `drizzle.__drizzle_migrations`, or null when nothing is applied. */
  newestAppliedAt: number | null;
  /** Journal entries whose hash is recorded in the database. */
  appliedCount: number;
  /** Applied hashes the current journal does not contain. */
  unknownAppliedHashes: string[];
  statuses: MigrationEntryStatus[];
  /** Applied migrations whose file hash changed since they ran; drizzle never re-runs them. */
  modifiedApplied: MigrationEntryStatus[];
  /** Entries drizzle will silently skip: not applied, `when` <= newestAppliedAt. */
  wouldBeSkipped: MigrationEntryStatus[];
  pending: MigrationEntryStatus[];
}

export function buildMigrationPlan(migrationsDir: string): MigrationPlan {
  const journalPath = join(migrationsDir, 'meta', '_journal.json');
  if (!existsSync(journalPath)) {
    throw new Error(`No migration journal found at ${journalPath}`);
  }

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
      hash: createHash('sha256')
        .update(readFileSync(join(migrationsDir, file)))
        .digest('hex'),
    });
  }

  const tags = new Set(entries.map((entry) => entry.tag));
  const unjournaledFiles = sqlFiles.filter(
    (file) => ![...tags].some((tag) => file.startsWith(`${tag}.`)),
  );

  return { entries: plan, unjournaledFiles, missingTags };
}

export function assertMigrationPlanIsConsistent(plan: MigrationPlan): void {
  if (plan.missingTags.length > 0) {
    throw new Error(`Missing migration files: ${plan.missingTags.join(', ')}`);
  }
  if (plan.unjournaledFiles.length > 0) {
    throw new Error(`Unjournaled migration files: ${plan.unjournaledFiles.join(', ')}`);
  }

  const missingWhen = plan.entries
    .filter((entry) => typeof entry.when !== 'number')
    .map((entry) => entry.tag);
  if (missingWhen.length > 0) {
    throw new Error(
      `Journal entries without a numeric 'when' timestamp: ${missingWhen.join(', ')}`,
    );
  }

  const unexpected = findDuplicateWhenGroups(plan.entries).filter((group) => !group.allowed);
  if (unexpected.length > 0) {
    const described = unexpected
      .map((group) => `${group.when} shared by ${group.tags.join(', ')}`)
      .join('; ');
    throw new Error(
      `Duplicate migration journal 'when' timestamps: ${described}. The only permitted duplicate ` +
        `is the historical ${HISTORICAL_DUPLICATE_WHEN_TAGS.join(', ')} group. Drizzle applies an ` +
        'entry only when its `when` is newer than the newest applied `created_at`, so a new duplicate ' +
        'can be skipped silently. Regenerate the migration (`pnpm --filter @kestrel/db migrate:gen`) ' +
        'so its `when` is unique and newer.',
    );
  }
}

/**
 * Classify every journal entry against what `drizzle.__drizzle_migrations`
 * already records. Pure so the CLI scripts and tests share one decision table.
 */
export function auditMigrationPlan(
  plan: MigrationPlan,
  applied: readonly AppliedMigration[],
): MigrationAppliedAudit {
  const appliedHashes = new Set(applied.map((row) => row.hash));
  const appliedWhens = new Set(applied.map((row) => row.createdAt));

  let newestAppliedAt: number | null = null;
  for (const row of applied) {
    if (newestAppliedAt === null || row.createdAt > newestAppliedAt) {
      newestAppliedAt = row.createdAt;
    }
  }

  const statuses: MigrationEntryStatus[] = plan.entries.map((entry) => {
    if (typeof entry.when !== 'number') {
      throw new Error(
        `Journal entry ${entry.tag} has no numeric 'when' timestamp; drizzle would record it as NULL ` +
          'and could skip later migrations. Regenerate the migration.',
      );
    }

    let state: MigrationEntryState = 'pending';
    if (appliedHashes.has(entry.hash)) {
      state = 'applied';
    } else if (appliedWhens.has(entry.when)) {
      // A row exists at this entry's timestamp but with a different hash: the
      // migration ran and its file has since been edited.
      state = 'applied-modified';
    } else if (newestAppliedAt !== null && entry.when <= newestAppliedAt) {
      state = 'would-be-skipped';
    }

    return { tag: entry.tag, when: entry.when, state };
  });

  const journalHashes = new Set(plan.entries.map((entry) => entry.hash));
  const unknownAppliedHashes = [...appliedHashes].filter((hash) => !journalHashes.has(hash));

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
 * Refuse to run a plan that drizzle would not fully apply. Drizzle compares
 * each entry's `when` against the newest `created_at` in the migrations table
 * (`order by created_at desc limit 1`) rather than following journal order, so
 * an entry whose timestamp is not strictly newer is skipped without warning.
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
        '\nCreate a NEW migration with a newer `when` instead of editing an applied one.',
    );
  }

  if (audit.wouldBeSkipped.length > 0) {
    problems.push(
      `${audit.wouldBeSkipped.length} migration(s) would be silently skipped because their \`when\` ` +
        `is not newer than the newest applied \`created_at\` (${audit.newestAppliedAt}):\n` +
        audit.wouldBeSkipped.map((entry) => `  - ${entry.tag} (when=${entry.when})`).join('\n') +
        '\nDrizzle applies migrations by `when` timestamp, not journal order (it compares against the ' +
        'newest `created_at` in drizzle.__drizzle_migrations). Regenerate the migration so its `when` ' +
        'is strictly newer, or restore the original journal timestamp.',
    );
  }

  if (problems.length > 0) {
    throw new Error(`Migration preflight failed — refusing to apply:\n${problems.join('\n\n')}`);
  }
  return audit;
}

export interface RequiredSchemaObjects {
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
