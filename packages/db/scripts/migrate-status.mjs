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
// Queries the database's __drizzle_migrations table and compares it
// against the journal. Reports four states per entry (R11):
//
//   [OK]         applied — recorded hash matches the file on disk.
//   [MODIFIED]   applied, but the file on disk was edited afterwards.
//                Drizzle keys on the recorded hash, so it will NEVER
//                re-run this entry, and the change is not live.
//   [PENDING]    not applied, and strictly newer than the newest recorded
//                created_at — drizzle will apply it.
//   [WILL-SKIP]  not applied, but its `when` is at or below the newest
//                recorded created_at — drizzle will silently skip it.
//
// Usage: pnpm --filter @kestrel/db migrate:status
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  assertMigrationPlanIsConsistent,
  auditMigrationPlan,
  buildMigrationPlan,
} from '../dist/migration-plan.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const DRIZZLE_DIR = join(HERE, '..', 'drizzle');

const journalPath = join(DRIZZLE_DIR, 'meta', '_journal.json');
if (!existsSync(journalPath)) {
  console.error('No migration journal found. Run `pnpm migrate:gen` first.');
  process.exit(1);
}

const plan = buildMigrationPlan(DRIZZLE_DIR);
try {
  assertMigrationPlanIsConsistent(plan);
} catch (error) {
  console.error(`[migrate:status] ${error.message}`);
  process.exit(1);
}
const journalEntries = plan.entries;

console.log('\nMigration Status\n');
console.log(`   Journal entries: ${journalEntries.length}`);
console.log(`   SQL files found: ${journalEntries.length}\n`);

if (plan.missingTags.length > 0) {
  for (const tag of plan.missingTags) console.log(`   [MISSING]  ${tag}`);
  console.log('\nSome migration files are missing. Run `pnpm migrate:gen` to regenerate.\n');
  process.exit(1);
}

if (plan.unjournaledFiles.length > 0) {
  for (const file of plan.unjournaledFiles) console.log(`   [UNJOURNALED]  ${file}`);
  console.log(
    '\nSome SQL files are not present in _journal.json. Register or remove them before deploying.\n',
  );
  process.exit(1);
}

const dbUrl =
  process.env.DIRECT_URL ||
  process.env.POSTGRES_URL_NON_POOLING ||
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL;
if (!dbUrl) {
  for (const entry of journalEntries) console.log(`   [OK]  ${entry.tag} (file present)`);
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
  function resolveSslOption() {
    const ca = process.env.SUPABASE_CA_CERT?.replace(/\\n/g, '\n').trim();
    if (ca) return { ca, rejectUnauthorized: true };

    if (process.env.DB_DISABLE_SSL === 'true') {
      if (process.env.NODE_ENV !== 'production' || process.env.KESTREL_LOCAL_DOCKER === 'true') {
        return false;
      }
      throw new Error(
        'DB_DISABLE_SSL=true is only permitted with KESTREL_LOCAL_DOCKER=true; configure verified TLS for production databases.',
      );
    }

    const productionTls =
      process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production';
    return productionTls ? { rejectUnauthorized: true } : { rejectUnauthorized: false };
  }

  const sql = postgres(dbUrl, {
    prepare: false,
    ssl: resolveSslOption(),
  });

  try {
    const tracking = await sql`
      SELECT to_regclass('drizzle.__drizzle_migrations') AS table_name
    `;
    const rows = tracking[0]?.table_name
      ? await sql`
          SELECT hash, created_at FROM drizzle."__drizzle_migrations" ORDER BY id
        `
      : [];
    const audit = auditMigrationPlan(
      plan,
      rows.map((row) => ({ hash: row.hash, createdAt: Number(row.created_at) })),
    );

    console.log(
      `   Database has ${rows.length} applied migration row(s); newest created_at ` +
        `${audit.newestAppliedAt ?? 'none'}.\n`,
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
        `\n   Database contains ${audit.unknownAppliedHashes.length} applied migration hash(es) absent from the current journal:`,
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
      console.error('   Create a NEW migration with a newer `when` instead of editing this one.\n');
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
