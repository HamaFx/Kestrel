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

// Shared weekly-review fan-out runner: the worker `weekly-review` job and the
// `/api/cron/weekly-review` fallback both execute this code.

import { getActiveUserIds, withAdminDb, withUserTenant } from '@kestrel/db';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { emitWeeklyReview } from '../src/briefings/generate';
import { runWeeklyReviewFanout } from '../src/cron/weekly-review';

const state = vi.hoisted(() => ({
  adminScopes: 0,
  tenantScopes: [] as string[],
  activeTenantScopes: new Set<string>(),
  weeklyEmitsInScope: [] as boolean[],
}));

vi.mock('@kestrel/db', () => ({
  getActiveUserIds: vi.fn(async () => ['u1']),
  withAdminDb: vi.fn(async (fn: () => Promise<unknown>) => {
    state.adminScopes += 1;
    return fn();
  }),
  withUserTenant: vi.fn(async (userId: string, fn: () => Promise<unknown>) => {
    state.tenantScopes.push(userId);
    state.activeTenantScopes.add(userId);
    try {
      return await fn();
    } finally {
      state.activeTenantScopes.delete(userId);
    }
  }),
}));

vi.mock('../src/briefings/generate', () => ({
  emitWeeklyReview: vi.fn(async (userId: string) => {
    state.weeklyEmitsInScope.push(state.activeTenantScopes.has(userId));
    return { emitted: true };
  }),
}));

beforeEach(() => {
  state.adminScopes = 0;
  state.tenantScopes = [];
  state.activeTenantScopes.clear();
  state.weeklyEmitsInScope = [];
  vi.mocked(getActiveUserIds).mockResolvedValue(['u1']);
  vi.mocked(emitWeeklyReview).mockClear();
});

describe('runWeeklyReviewFanout', () => {
  it('discovers users via withAdminDb and emits inside withUserTenant', async () => {
    vi.mocked(getActiveUserIds).mockResolvedValue(['u1', 'u2']);

    const result = await runWeeklyReviewFanout();

    expect(withAdminDb).toHaveBeenCalledTimes(1);
    expect(state.adminScopes).toBe(1);
    expect(state.tenantScopes).toEqual(['u1', 'u2']);
    expect(state.weeklyEmitsInScope).toEqual([true, true]);
    expect(result.processed).toBe(2);
  });

  it('reports per-user reasons without failing the fan-out', async () => {
    vi.mocked(getActiveUserIds).mockResolvedValue(['u1', 'u2']);
    vi.mocked(emitWeeklyReview)
      .mockResolvedValueOnce({ emitted: false, reason: 'already-emitted' })
      .mockRejectedValueOnce(new Error('db down'));

    const result = await runWeeklyReviewFanout();

    expect(result.processed).toBe(0);
    expect(result.reasons).toEqual(['[u1]: already-emitted', '[u2]: error']);
  });

  it('stops at the next user when the signal is aborted', async () => {
    const controller = new AbortController();
    vi.mocked(getActiveUserIds).mockResolvedValue(['u1', 'u2']);
    vi.mocked(emitWeeklyReview).mockImplementationOnce(async () => {
      controller.abort();
      return { emitted: true };
    });

    const result = await runWeeklyReviewFanout({ signal: controller.signal });

    expect(result.processed).toBe(1);
    expect(withUserTenant).toHaveBeenCalledTimes(1);
  });
});
