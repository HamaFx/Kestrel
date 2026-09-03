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

// Shared PGlite + LibSQL harness for the durable Full-analysis queue tests.
// Mirrors the single-user tenant shape used by the production PGlite path:
// one user whose organization id equals the user id.

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { applyMigrations, closePGliteDb, getPGliteDb } from '@kestrel/db/pglite';
import { container } from '@kestrel/shared';
import { LibSQLStore } from '@mastra/libsql';

import {
  _resetKestrelMastra,
  _setKestrelMastraForTest,
  createKestrelMastra,
  initializeKestrelMastra,
} from '../../src/mastra-v2';
import { DB } from '../../src/tokens';

export async function withQueueStorage<T>(
  fn: (db: Awaited<ReturnType<typeof getPGliteDb>>) => Promise<T>,
): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), 'kestrel-full-analysis-'));
  await applyMigrations(dir);
  const db = await getPGliteDb(dir);
  await db.execute(
    `INSERT INTO "user" ("id", "email") VALUES ('user-1', 'full-analysis@example.com')`,
  );
  await db.execute(
    `INSERT INTO "organization" ("id", "name") VALUES ('user-1', 'Full analysis workspace') ON CONFLICT ("id") DO NOTHING`,
  );
  await db.execute(
    `INSERT INTO "organization_member" ("org_id", "user_id", "role") VALUES ('user-1', 'user-1', 'owner') ON CONFLICT ("org_id", "user_id") DO NOTHING`,
  );
  container.register(DB, () => db as never);

  const file = join(dir, 'mastra.db');
  const store = new LibSQLStore({ id: 'test-durable', url: `file:${file}` });
  const mastra = createKestrelMastra({ storage: store, storageKind: 'libsql', env: {} });
  await initializeKestrelMastra(mastra);
  _setKestrelMastraForTest(mastra);
  try {
    return await fn(db);
  } finally {
    _resetKestrelMastra();
    container.register(DB, () => {
      throw new Error('Full-analysis test DB was not initialized');
    });
    await closePGliteDb();
    rmSync(dir, { recursive: true, force: true });
  }
}
