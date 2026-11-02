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

// Shared briefings fan-out runner: the worker `briefings` job and the
// `/api/cron/briefings` fallback both execute this code. The RLS assertions
// pin the audit 2026-10-31 (R1) contract: discovery via `withAdminDb`, each
// user's prefetch + emits inside `withUserTenant`.

import { getActiveUserIds, withAdminDb, withUserTenant } from '@kestrel/db';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { emitPostEvent, emitPreEvent } from '../src/briefings/generate';
import { findHighImpactEventsInWindow, listEmittedEventIds } from '../src/briefings/persistence';
import { runBriefingsFanout } from '../src/cron/briefings';

const state = vi.hoisted(() => ({
  adminScopes: 0,
  tenantScopes: [] as string[],
  activeTenantScopes: new Set<string>(),
  preEmitsInScope: [] as boolean[],
  postEmitsInScope: [] as boolean[],
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
  emitPreEvent: vi.fn(async (userId: string) => {
    state.preEmitsInScope.push(state.activeTenantScopes.has(userId));
    return { emitted: true };
  }),
  emitPostEvent: vi.fn(async (userId: string) => {
    state.postEmitsInScope.push(state.activeTenantScopes.has(userId));
    return { emitted: true };
  }),
}));

vi.mock('../src/briefings/persistence', () => ({
  findHighImpactEventsInWindow: vi.fn(),
  listEmittedEventIds: vi.fn(async () => new Set<string>()),
}));

beforeEach(() => {
  state.adminScopes = 0;
  state.tenantScopes = [];
  state.activeTenantScopes.clear();
  state.preEmitsInScope = [];
  state.postEmitsInScope = [];
  vi.mocked(getActiveUserIds).mockResolvedValue(['u1']);
  vi.mocked(findHighImpactEventsInWindow).mockReset();
  vi.mocked(listEmittedEventIds).mockReset().mockResolvedValue(new Set());
  vi.mocked(emitPreEvent).mockClear();
  vi.mocked(emitPostEvent).mockClear();
});

describe('runBriefingsFanout', () => {
  it('emits pre + post for each candidate and reports counts', async () => {
    vi.mocked(findHighImpactEventsInWindow)
      .mockResolvedValueOnce([{ id: 'e1' }, { id: 'e2' }])
      .mockResolvedValueOnce([{ id: 'e3' }]);

    const result = await runBriefingsFanout({ signal: new AbortController().signal });

    expect(result.processed).toBe(3);
    expect(result.note).toMatch(/pre=2\/2/);
    expect(result.note).toMatch(/post=1\/1/);
  });

  it('continues past per-event failures', async () => {
    vi.mocked(findHighImpactEventsInWindow)
      .mockResolvedValueOnce([{ id: 'e1' }, { id: 'e2' }])
      .mockResolvedValueOnce([]);
    vi.mocked(emitPreEvent)
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({ emitted: true });

    const result = await runBriefingsFanout({ signal: new AbortController().signal });

    expect(result.processed).toBe(2);
    expect(result.note).toMatch(/pre=1\/2/);
  });

  it('skips already-emitted pairs via the batch idempotency prefetch', async () => {
    vi.mocked(findHighImpactEventsInWindow)
      .mockResolvedValueOnce([{ id: 'e1' }, { id: 'e2' }])
      .mockResolvedValueOnce([]);
    vi.mocked(listEmittedEventIds).mockResolvedValue(new Set(['e1']));

    const result = await runBriefingsFanout({ signal: new AbortController().signal });

    expect(emitPreEvent).toHaveBeenCalledTimes(1);
    expect(vi.mocked(emitPreEvent).mock.calls[0]?.[1]).toBe('e2');
    expect(result.note).toMatch(/pre=1\/2/);
  });

  it('honours abort signal between candidates', async () => {
    const ac = new AbortController();
    vi.mocked(findHighImpactEventsInWindow)
      .mockResolvedValueOnce([{ id: 'e1' }, { id: 'e2' }])
      .mockResolvedValueOnce([]);
    vi.mocked(emitPreEvent).mockImplementationOnce(async (userId: string) => {
      state.preEmitsInScope.push(state.activeTenantScopes.has(userId));
      ac.abort();
      return { emitted: true };
    });

    await runBriefingsFanout({ signal: ac.signal });

    expect(emitPreEvent).toHaveBeenCalledTimes(1);
  });

  it('discovers users on the admin connection and emits inside each tenant scope', async () => {
    vi.mocked(getActiveUserIds).mockResolvedValue(['u1', 'u2']);
    vi.mocked(findHighImpactEventsInWindow)
      .mockResolvedValueOnce([{ id: 'pre-1' }])
      .mockResolvedValueOnce([{ id: 'post-1' }]);

    const result = await runBriefingsFanout();

    expect(withAdminDb).toHaveBeenCalledTimes(1);
    expect(withUserTenant).toHaveBeenCalledTimes(2);
    expect(state.tenantScopes).toEqual(['u1', 'u2']);
    expect(state.preEmitsInScope).toEqual([true, true]);
    expect(state.postEmitsInScope).toEqual([true, true]);
    expect(result.note).toMatch(/pre=2\/1/);
    expect(result.note).toMatch(/post=2\/1/);
  });

  it('returns the owned-empty note when the partition owns no users', async () => {
    const result = await runBriefingsFanout({ filterUserIds: () => [] });

    expect(result.processed).toBe(0);
    expect(result.note).toBe('no owned active users');
    expect(findHighImpactEventsInWindow).not.toHaveBeenCalled();
  });
});
