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

// Batch 4: exercises `withUserScope` against the REAL Drizzle schema tables
// and compiles the fragment through Drizzle's Postgres dialect, instead of
// asserting equality against a fake `{ userId: { name } }` object literal.

import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import { alerts, chatThreads, journalEntries } from '../src/schema';
import { withUserScope } from '../src/with-user-scope';

const SCOPE_TABLES = [
  ['alerts', alerts, '"alerts"."user_id" = $1'],
  ['chatThreads', chatThreads, '"chat_threads"."user_id" = $1'],
  ['journalEntries', journalEntries, '"journal_entries"."user_id" = $1'],
] as const;

describe('withUserScope', () => {
  it.each(SCOPE_TABLES)(
    'compiles %s to a parameterized user_id equality against the real Drizzle table',
    (_name, table, expectedSql) => {
      const query = new PgDialect().sqlToQuery(withUserScope(table, 'user-123'));

      expect(query.sql).toBe(expectedSql);
      expect(query.params).toEqual(['user-123']);
    },
  );

  it('binds a different userId parameter per call', () => {
    const dialect = new PgDialect();

    const a = dialect.sqlToQuery(withUserScope(alerts, 'user-A'));
    const b = dialect.sqlToQuery(withUserScope(alerts, 'user-B'));

    expect(a.sql).toBe('"alerts"."user_id" = $1');
    expect(b.sql).toBe('"alerts"."user_id" = $1');
    expect(a.params).toEqual(['user-A']);
    expect(b.params).toEqual(['user-B']);
  });
});
