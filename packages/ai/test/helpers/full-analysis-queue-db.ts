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

import { execFileSync, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { LibSQLStore } from '@mastra/libsql';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';
import { container as dependencyContainer } from '@kestrel/shared';

import {
  _resetKestrelMastra,
  _setKestrelMastraForTest,
  createKestrelMastra,
  initializeKestrelMastra,
} from '../../src/mastra-v2';
import { DB } from '../../src/tokens';
import * as schema from '@kestrel/db/schema';

export type QueueTestDb = ReturnType<typeof drizzle<typeof schema>>;

let activeContainer: string | null = null;
let activeSql: ReturnType<typeof postgres> | null = null;

async function startPostgres(): Promise<{
  container: string;
  url: string;
  databaseName?: string;
}> {
  if (process.env.RUN_AI_QUEUE_POSTGRES_TESTS !== '1') {
    throw new Error(
      'Full-analysis queue database tests require disposable PostgreSQL. Set RUN_AI_QUEUE_POSTGRES_TESTS=1 and TEST_POSTGRES_ADMIN_URL, or run `pnpm test:postgres-rls` infrastructure.',
    );
  }
  if (process.env.TEST_POSTGRES_ADMIN_URL) {
    // Each test file receives an isolated database because migrations are
    // initialized independently by each worker.
    const admin = postgres(process.env.TEST_POSTGRES_ADMIN_URL, { max: 1, prepare: false });
    const dbName = `kestrel_ai_queue_${randomUUID().replaceAll('-', '_')}`;
    try {
      await admin.unsafe(`CREATE DATABASE ${dbName}`);
    } finally {
      await admin.end({ timeout: 5 });
    }
    const url = new URL(process.env.TEST_POSTGRES_ADMIN_URL);
    url.pathname = `/${dbName}`;
    return { container: '', url: url.toString(), databaseName: dbName };
  }

  const container = `kestrel-ai-queue-postgres-${randomUUID().slice(0, 8)}`;
  const password = 'kestrel-ai-queue-password';
  const port = String(55440 + Math.floor(Math.random() * 500));
  execFileSync(
    'docker',
    [
      'run',
      '--detach',
      '--rm',
      '--name',
      container,
      '--publish',
      `127.0.0.1:${port}:5432`,
      '--env',
      'POSTGRES_USER=postgres',
      '--env',
      `POSTGRES_PASSWORD=${password}`,
      'pgvector/pgvector:pg16',
    ],
    { stdio: 'inherit' },
  );
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const result = spawnSync('docker', ['exec', container, 'pg_isready', '-U', 'postgres'], {
      encoding: 'utf-8',
    });
    if (result.status === 0) {
      return { container, url: `postgres://postgres:${password}@127.0.0.1:${port}/postgres` };
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error('Disposable PostgreSQL did not become ready');
}

async function applyMigrations(raw: postgres.Sql): Promise<void> {
  const { readdirSync, readFileSync } = await import('node:fs');
  const dir = join(process.cwd(), '../../packages/db/drizzle');
  const journal = JSON.parse(readFileSync(join(dir, 'meta/_journal.json'), 'utf-8'));
  for (const entry of journal.entries ?? []) {
    const file = readdirSync(dir).find((name) => name.startsWith(`${entry.tag}.sql`));
    if (!file) throw new Error(`Missing migration ${entry.tag}`);
    const statements = readFileSync(join(dir, file), 'utf-8').split('--> statement-breakpoint');
    for (const statement of statements) {
      const executable = statement
        .split('\n')
        .filter((line) => !line.trim().startsWith('--'))
        .join('\n')
        .trim();
      if (executable) await raw.unsafe(executable);
    }
  }
}

export async function withQueueStorage<T>(fn: (db: QueueTestDb) => Promise<T>): Promise<T> {
  const { container, url, databaseName } = await startPostgres();
  const raw = postgres(url, { max: 1, prepare: false });
  activeSql = raw;
  activeContainer = container || null;

  const db = drizzle(raw, { schema });
  await db.execute(sql`CREATE EXTENSION IF NOT EXISTS vector`);
  await db.execute(sql`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        CREATE ROLE anon NOLOGIN;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        CREATE ROLE authenticated NOLOGIN;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        CREATE ROLE service_role NOLOGIN;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'postgres') THEN
        CREATE ROLE postgres NOLOGIN;
      END IF;
    END
    $$
  `);
  await applyMigrations(raw);
  await db.execute(
    sql`INSERT INTO "user" ("id", "email") VALUES ('user-1', 'full-analysis@example.com')`,
  );
  await db.execute(
    sql`INSERT INTO "organization" ("id", "name") VALUES ('user-1', 'Full analysis workspace') ON CONFLICT ("id") DO NOTHING`,
  );
  await db.execute(
    sql`INSERT INTO "organization_member" ("org_id", "user_id", "role") VALUES ('user-1', 'user-1', 'owner') ON CONFLICT ("org_id", "user_id") DO NOTHING`,
  );
  dependencyContainer.register(DB, () => db as never);

  const dir = mkdtempSync(join(tmpdir(), 'kestrel-full-analysis-'));
  const store = new LibSQLStore({ id: 'test-durable', url: `file:${join(dir, 'mastra.db')}` });
  const mastra = createKestrelMastra({ storage: store, storageKind: 'libsql', env: {} });
  await initializeKestrelMastra(mastra);
  _setKestrelMastraForTest(mastra);
  try {
    return await fn(db);
  } finally {
    _resetKestrelMastra();
    dependencyContainer.register(DB, () => {
      throw new Error('Full-analysis test DB was not initialized');
    });
    await raw.end({ timeout: 5 });
    activeSql = null;
    if (databaseName) {
      const adminUrl = process.env.TEST_POSTGRES_ADMIN_URL!;
      const admin = postgres(adminUrl, { max: 1, prepare: false });
      try {
        await admin.unsafe(`DROP DATABASE ${databaseName} WITH (FORCE)`);
      } catch {
        // Best-effort cleanup; CI service containers are disposable.
      } finally {
        await admin.end({ timeout: 5 });
      }
    }
    if (container) {
      spawnSync('docker', ['rm', '--force', container], { stdio: 'ignore' });
      activeContainer = null;
    }
    rmSync(dir, { recursive: true, force: true });
  }
}

export { activeSql, activeContainer };
