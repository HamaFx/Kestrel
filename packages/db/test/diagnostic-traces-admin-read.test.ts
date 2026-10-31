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

// Audit 2026-10-31 (R1) — connection choice for the diagnostic trace reads.
// `diagnostic_traces` is RLS-protected (migration 0098). The owner-scoped
// helpers run on the request/tenant connection; the admin variants are
// cross-tenant and must run on the admin (BYPASSRLS) connection, or on a
// caller-provided admin client. Never fall back to the tenant client.

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type * as clientModule from '../src/client';
import {
  getDiagnosticTrace,
  getDiagnosticTraceForAdmin,
  listDiagnosticTracesForAdmin,
} from '../src/queries/diagnostic-traces/read';
import type { DiagnosticTraceRow } from '../src/queries/diagnostic-traces/types';

const mocks = vi.hoisted(() => ({
  getAdminDb: vi.fn(),
  getDb: vi.fn(),
}));

vi.mock('../src/client', async (importOriginal) => {
  const actual = await importOriginal<typeof clientModule>();
  return {
    ...actual,
    getAdminDb: mocks.getAdminDb,
    getDb: mocks.getDb,
  };
});

const TRACE = {
  id: 'trace-1',
  userId: 'user-1',
  threadId: 'thread-1',
  startedAt: new Date('2026-07-24T10:00:00.000Z'),
  stepCount: 5,
  errorCount: 0,
  status: 'completed',
  durationMs: 42,
} as DiagnosticTraceRow;

/** Minimal thenable Drizzle-query stand-in that records the limit argument. */
class FakeDb {
  public limitArgs: unknown[] = [];

  constructor(private readonly rows: unknown[]) {}

  select(): this {
    return this;
  }
  from(): this {
    return this;
  }
  where(): this {
    return this;
  }
  orderBy(): this {
    return this;
  }
  limit(arg?: unknown): Promise<unknown[]> {
    this.limitArgs.push(arg);
    return Promise.resolve(this.rows);
  }
}

describe('diagnostic trace admin reads use the admin connection (R1)', () => {
  beforeEach(() => {
    mocks.getAdminDb.mockReset();
    mocks.getDb.mockReset();
  });

  it('getDiagnosticTraceForAdmin reads on the admin client by default', async () => {
    const admin = new FakeDb([TRACE]);
    mocks.getAdminDb.mockReturnValue(admin);

    await expect(getDiagnosticTraceForAdmin('trace-1')).resolves.toEqual(TRACE);

    expect(mocks.getAdminDb).toHaveBeenCalledTimes(1);
    expect(mocks.getDb).not.toHaveBeenCalled();
  });

  it('listDiagnosticTracesForAdmin reads on the admin client and clamps the limit', async () => {
    const admin = new FakeDb([TRACE]);
    mocks.getAdminDb.mockReturnValue(admin);

    await expect(listDiagnosticTracesForAdmin({ limit: 500 })).resolves.toEqual([TRACE]);

    expect(mocks.getAdminDb).toHaveBeenCalledTimes(1);
    expect(mocks.getDb).not.toHaveBeenCalled();
    expect(admin.limitArgs).toEqual([100]);
  });

  it('prefers a caller-provided client over the admin pool', async () => {
    const provided = new FakeDb([TRACE]);

    await expect(
      getDiagnosticTraceForAdmin('trace-1', provided as unknown as clientModule.DbClient),
    ).resolves.toEqual(TRACE);

    expect(mocks.getAdminDb).not.toHaveBeenCalled();
    expect(mocks.getDb).not.toHaveBeenCalled();
  });

  it('keeps the owner-scoped helpers on the tenant client', async () => {
    const tenant = new FakeDb([TRACE]);
    mocks.getDb.mockReturnValue(tenant);

    await expect(getDiagnosticTrace('user-1', 'trace-1')).resolves.toEqual(TRACE);

    expect(mocks.getDb).toHaveBeenCalledTimes(1);
    expect(mocks.getAdminDb).not.toHaveBeenCalled();
  });
});
