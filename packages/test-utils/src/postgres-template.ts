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

import { createHash, randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import postgres from 'postgres';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Works from both `src/` (dev/typecheck) and `dist/` (published package):
// both are two directories below `packages/test-utils`.
const DRIZZLE_DIR = resolve(__dirname, '../../db/drizzle');

// Fixed advisory-lock key: every test worker serializes template creation, so
// only one of them ever runs the 119 migrations.
const TEMPLATE_LOCK_ID = 74839201;
const TEMPLATE_PREFIX = 'kestrel_tmpl_';

type Raw = ReturnType<typeof postgres>;

interface JournalEntry {
  tag: string;
}

/** Hash the journal and every migration body, so an edited migration rebuilds the template. */
function computeTemplateIdentity(): string {
  const journalRaw = readFileSync(join(DRIZZLE_DIR, 'meta/_journal.json'), 'utf8');
  const hash = createHash('sha256').update(journalRaw);
  const files = readdirSync(DRIZZLE_DIR)
    .filter((name) => name.endsWith('.sql'))
    .sort();
  for (const file of files) {
    hash.update(file);
    hash.update(readFileSync(join(DRIZZLE_DIR, file), 'utf8'));
  }
  return hash.digest('hex').slice(0, 10);
}

async function applyMigrations(client: Raw): Promise<void> {
  await client.unsafe(`CREATE EXTENSION IF NOT EXISTS vector`);
  await client.unsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'postgres') THEN CREATE ROLE postgres NOLOGIN; END IF;
    END
    $$;
  `);

  const journal = JSON.parse(readFileSync(join(DRIZZLE_DIR, 'meta/_journal.json'), 'utf8')) as {
    entries?: JournalEntry[];
  };
  const files = readdirSync(DRIZZLE_DIR);
  for (const entry of journal.entries ?? []) {
    const file = files.find((name) => name.startsWith(`${entry.tag}.sql`));
    if (!file) throw new Error(`Missing migration ${entry.tag}`);
    const statements = readFileSync(join(DRIZZLE_DIR, file), 'utf8').split(
      '--> statement-breakpoint',
    );
    for (const statement of statements) {
      const executable = statement
        .split('\n')
        .filter((line) => !line.trim().startsWith('--'))
        .join('\n')
        .trim();
      if (executable) await client.unsafe(executable);
    }
  }
}

function databaseUrl(adminUrl: string, databaseName: string): string {
  const url = new URL(adminUrl);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

async function dropDatabase(admin: Raw, databaseName: string): Promise<void> {
  await admin.unsafe(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
}

async function ensureTemplateDatabase(admin: Raw, adminUrl: string): Promise<string> {
  const templateName = `${TEMPLATE_PREFIX}${computeTemplateIdentity()}`;
  await admin.unsafe(`SELECT pg_advisory_lock(${TEMPLATE_LOCK_ID})`);
  try {
    const existing = await admin.unsafe<{ datistemplate: boolean }[]>(
      `SELECT datistemplate FROM pg_database WHERE datname = $1`,
      [templateName],
    );
    if (existing[0]?.datistemplate) return templateName;

    // A previous worker may have died after CREATE DATABASE but before the
    // migrations finished. Drop the partial database and rebuild it.
    if (existing.length > 0) {
      await admin.unsafe(
        `SELECT pg_terminate_backend(pid)
           FROM pg_stat_activity
          WHERE datname = $1 AND pid <> pg_backend_pid()`,
        [templateName],
      );
      await dropDatabase(admin, templateName);
    }

    await admin.unsafe(`CREATE DATABASE "${templateName}"`);
    const templateClient = postgres(databaseUrl(adminUrl, templateName), {
      max: 1,
      prepare: false,
    });
    try {
      await applyMigrations(templateClient);
    } catch (error) {
      await templateClient.end({ timeout: 5 }).catch(() => undefined);
      await dropDatabase(admin, templateName).catch(() => undefined);
      throw error;
    }
    await templateClient.end({ timeout: 5 });
    await admin.unsafe(`ALTER DATABASE "${templateName}" WITH IS_TEMPLATE = true`);
    return templateName;
  } finally {
    await admin.unsafe(`SELECT pg_advisory_unlock(${TEMPLATE_LOCK_ID})`);
  }
}

export interface MigratedTestDatabase {
  databaseName: string;
  connectionString: string;
  /** Drop the cloned database and release the admin connection. Idempotent. */
  drop: () => Promise<void>;
}

/**
 * Clone a fresh, fully-migrated PostgreSQL test database from a cached
 * template database. Template creation runs the migrations once under an
 * advisory lock; every later call is a `CREATE DATABASE ... TEMPLATE` clone
 * (tens of milliseconds) and never touches the migration files.
 */
export async function createMigratedTestDatabase(
  adminUrl: string,
  prefix = 'kestrel_test',
): Promise<MigratedTestDatabase> {
  const admin = postgres(adminUrl, { max: 1, prepare: false });
  let dropped = false;

  try {
    const templateName = await ensureTemplateDatabase(admin, adminUrl);
    const databaseName = `${prefix}_${randomUUID().replaceAll('-', '_')}`;

    // A template database cannot be cloned while another session is connected
    // to it. Workers only ever connect to their clone, but a crashed sibling
    // may have left a connection behind.
    await admin.unsafe(
      `SELECT pg_terminate_backend(pid)
         FROM pg_stat_activity
        WHERE datname = $1 AND pid <> pg_backend_pid()`,
      [templateName],
    );
    await admin.unsafe(`CREATE DATABASE "${databaseName}" TEMPLATE "${templateName}"`);

    return {
      databaseName,
      connectionString: databaseUrl(adminUrl, databaseName),
      drop: async () => {
        if (dropped) return;
        dropped = true;
        try {
          await dropDatabase(admin, databaseName);
        } finally {
          await admin.end({ timeout: 5 });
        }
      },
    };
  } catch (error) {
    await admin.end({ timeout: 5 }).catch(() => undefined);
    throw error;
  }
}
