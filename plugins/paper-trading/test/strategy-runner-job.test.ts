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

// Worker-level tenant-scope guarantee for the deployed-strategy runner.
//
// The job runs outside any request transaction, but every strategy flip
// touches FORCE ROW LEVEL SECURITY tables (plg_paper_trading_*, trade_journal)
// so each installed user must be processed inside `withTenantDb`.

import type * as dbModule from '@kestrel/db';
import type { PluginInstalledUser, PluginJobContext } from '@kestrel/plugin-sdk';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { paperStrategyRunnerJob } from '../src/jobs/strategy-runner';

const mocks = vi.hoisted(() => ({
  withTenantDb: vi.fn(),
  runStrategyRunsForUser: vi.fn(),
}));

vi.mock('@kestrel/db', async (importOriginal) => {
  const actual = await importOriginal<typeof dbModule>();
  return { ...actual, withTenantDb: mocks.withTenantDb };
});

vi.mock('../src/strategy-runner', () => ({
  runStrategyRunsForUser: mocks.runStrategyRunsForUser,
}));

function buildContext(users: readonly PluginInstalledUser[]): PluginJobContext {
  return {
    pluginId: 'paper-trading',
    jobId: 'strategy-runner',
    log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    signal: new AbortController().signal,
    getInstalledUsers: async () => users,
  } as unknown as PluginJobContext;
}

describe('paper strategy-runner job tenant scope', () => {
  beforeEach(() => {
    mocks.withTenantDb.mockReset();
    mocks.runStrategyRunsForUser.mockReset();
    mocks.withTenantDb.mockImplementation(async (_tenantId: string, work: () => Promise<unknown>) =>
      work(),
    );
    mocks.runStrategyRunsForUser.mockResolvedValue({
      evaluated: 1,
      entered: 0,
      closed: 0,
      errors: 0,
    });
  });

  it('wraps each installed user in withTenantDb(tenantId, ..., { userId })', async () => {
    const result = await paperStrategyRunnerJob.run(
      buildContext([
        { userId: 'user-1', tenantId: 'tenant-1', settings: {} },
        { userId: 'user-2', tenantId: 'tenant-2', settings: {} },
      ]),
    );

    expect(mocks.withTenantDb).toHaveBeenCalledWith('tenant-1', expect.any(Function), {
      userId: 'user-1',
    });
    expect(mocks.withTenantDb).toHaveBeenCalledWith('tenant-2', expect.any(Function), {
      userId: 'user-2',
    });
    expect(mocks.runStrategyRunsForUser).toHaveBeenCalledTimes(2);
    expect(result.processed).toBe(2);
  });

  it('isolates a failing user and keeps processing the rest', async () => {
    mocks.runStrategyRunsForUser
      .mockRejectedValueOnce(new Error('RLS failure'))
      .mockResolvedValueOnce({ evaluated: 1, entered: 1, closed: 0, errors: 0 });

    const result = await paperStrategyRunnerJob.run(
      buildContext([
        { userId: 'user-1', tenantId: 'tenant-1', settings: {} },
        { userId: 'user-2', tenantId: 'tenant-2', settings: {} },
      ]),
    );

    expect(result.processed).toBe(1);
    expect(result.note).toContain('1 error');
  });
});
