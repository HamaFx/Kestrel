#!/usr/bin/env node
/* eslint-disable no-console -- CLI status output is its public interface. */
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

// Phase 8 — Task 40: Migration status script
//
// Queries the database's __drizzle_migrations table and compares it against
// the migration folders. Drizzle v1 matches applied rows by folder name (with
// a hash fallback for rows that predate the name backfill), so a missing name
// is not itself a problem.
//
// States per entry:
//
//   [OK]         applied — recorded hash matches the file on disk.
//   [MODIFIED]   applied, but the file on disk was edited afterwards.
//                Drizzle keys on the recorded hash and never re-runs it.
//   [PENDING]    not applied; drizzle will apply it.
//   [WILL-SKIP]  legacy journal layout only (v0 timestamp ordering).
//
// Usage: pnpm --filter @kestrel/db migrate:status
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolveScriptSsl } from './lib/ssl.mjs';
import {
  assertMigrationPlanIsConsistent,
  auditMigrationPlan,
  buildMigrationPlan,
} from '../dist/migration-plan.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const DRIZZLE_DIR = join(HERE, '..', 'drizzle');

let plan;
try {
  plan = buildMigrationPlan(DRIZZLE_DIR);
  assertMigrationPlanIsConsistent(plan);
} catch (error) {
  console.error(`[migrate:status] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

const migrations = plan.entries;
const layoutLabel = plan.layout === 'folders' ? 'migration folders' : 'journal entries';

console.log('\nMigration Status\n');
console.log(`   Layout: ${plan.layout} (${migrations.length} ${layoutLabel})\n`);

if (plan.missingTags.length > 0) {
  for (const tag of plan.missingTags) console.log(`   [MISSING]  ${tag}`);
  console.log('\nSome migration files are missing. Run `pnpm migrate:gen` to regenerate.\n');
  process.exit(1);
}

if (plan.unjournaledFiles.length > 0) {
  for (const file of plan.unjournaledFiles) console.log(`   [UNTRACKED]  ${file}`);
  console.log('\nSome SQL files are outside the migration folders. Move or remove them.\n');
  process.exit(1);
}

const dbUrl =
  process.env.DIRECT_URL ||
  process.env.POSTGRES_URL_NON_POOLING ||
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL;
if (!dbUrl) {
  for (const entry of migrations) console.log(`   [OK]  ${entry.tag} (file present)`);
  console.log('\nDATABASE_URL not set — showing file-based status only.');
  console.log('Set DATABASE_URL to check which migrations are applied in the database.\n');
  process.exit(0);
}

const BADGES = {
  applied: '[OK]        ',
  'applied-modified': '[MODIFIED]  ',
  pending: '[PENDING]   ',
  'would-be-skipped': '[WILL-SKIP] ',
};

async function checkDatabase() {
  const { default: postgres } = await import('postgres');

  const sql = postgres(dbUrl, {
    prepare: false,
    ssl: resolveScriptSsl(dbUrl),
  });

  try {
    const tracking = await sql`
      SELECT to_regclass('drizzle.__drizzle_migrations') AS table_name
    `;
    let rows = [];
    if (tracking[0]?.table_name) {
      const columns = await sql`
        SELECT column_name FROM information_schema.columns
         WHERE table_schema = 'drizzle' AND table_name = '__drizzle_migrations'
      `;
      const hasName = columns.some((column) => column.column_name === 'name');
      const hasAppliedAt = columns.some((column) => column.column_name === 'applied_at');
      rows = hasName
        ? await sql`
            SELECT hash, created_at, name${hasAppliedAt ? sql`, applied_at` : sql``}
              FROM drizzle."__drizzle_migrations" ORDER BY id
          `
        : await sql`
            SELECT hash, created_at FROM drizzle."__drizzle_migrations" ORDER BY id
          `;
    }

    const audit = auditMigrationPlan(
      plan,
      rows.map((row) => ({
        hash: row.hash,
        createdAt: row.created_at === null ? null : Number(row.created_at),
        name: row.name ?? null,
      })),
    );

    const namedCount = rows.filter((row) => row.name).length;
    console.log(
      `   Database has ${rows.length} applied migration row(s) (${namedCount} named); ` +
        `newest created_at ${audit.newestAppliedAt ?? 'none'}.\n`,
    );

    for (const status of audit.statuses) {
      let suffix = '';
      if (status.state === 'applied-modified') {
        suffix = '  (file edited after it ran — drizzle will not re-run it)';
      } else if (status.state === 'would-be-skipped') {
        suffix = `  (when=${status.when} <= newest applied — drizzle will skip it)`;
      }
      console.log(`   ${BADGES[status.state]} ${status.tag}${suffix}`);
    }

    if (audit.unknownAppliedHashes.length > 0) {
      console.error(
        `\n   Database contains ${audit.unknownAppliedHashes.length} applied migration hash(es) absent from the current folder:`,
      );
      for (const hash of audit.unknownAppliedHashes) {
        console.error(`      ?  ${hash.substring(0, 12)}...`);
      }
      console.error('   Reconcile migration history before applying or deploying.');
      process.exitCode = 1;
    }

    console.log(
      `\n   Applied: ${audit.appliedCount}   Pending: ${audit.pending.length}   ` +
        `Applied but edited: ${audit.modifiedApplied.length}   Would be skipped: ${audit.wouldBeSkipped.length}\n`,
    );

    if (audit.modifiedApplied.length > 0) {
      console.error('   Applied migrations were edited after they ran:');
      for (const entry of audit.modifiedApplied) {
        console.error(`      !! ${entry.tag} (recorded when=${entry.when})`);
      }
      console.error(
        '\n   Drizzle records migrations by hash and will never re-run an edited file.',
      );
      console.error('   Create a NEW migration instead of editing this one.\n');
      process.exitCode = 1;
    }

    if (audit.wouldBeSkipped.length > 0) {
      console.error('   Pending migrations drizzle will silently skip:');
      for (const entry of audit.wouldBeSkipped) {
        console.error(`      !! ${entry.tag} (when=${entry.when} <= ${audit.newestAppliedAt})`);
      }
      console.error(
        '\n   Drizzle compares `when` against the newest recorded created_at and does not',
      );
      console.error(
        '   follow journal order. Regenerate the migration with a strictly newer `when`.\n',
      );
      process.exitCode = 1;
    }

    if (process.exitCode !== 1) {
      if (audit.pending.length > 0) {
        console.log('   Pending migrations:\n');
        for (const { tag, when } of audit.pending) {
          console.log(`      -> ${tag}  (when: ${when})`);
        }
        console.log('\n   Run `pnpm migrate:apply` to apply pending migrations.\n');
      } else {
        console.log('   All migrations are applied.\n');
      }
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
}

checkDatabase().catch((err) => {
  console.error('\nCould not query database:', err instanceof Error ? err.message : err);
  process.exit(1);
});
