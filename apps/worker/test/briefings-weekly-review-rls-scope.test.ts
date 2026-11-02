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

// Audit 2026-10-31 (R1) regression — the worker `briefings` and
// `weekly-review` jobs were missed when the tenant-scope fix landed on the
// web cron fallbacks.
//
// `getActiveUserIds` joins the RLS-protected `chat_threads` table, and every
// emit writes `briefings_emitted` / `chat_threads` / `chat_messages`.
// Under the non-bypass `kestrel_app` role an unscoped fan-out silently reads
// zero users (or fails RLS on write), so:
//   1. cross-tenant discovery must run inside `withAdminDb`, and
//   2. each user's prefetch + emits must run inside `withUserTenant`.
//
// The mocks record the scope each emit ran in, so a future refactor that
// drops a wrapper fails here instead of shipping a silent no-op.

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { runBriefings } from '../src/jobs/briefings';
import { runWeeklyReview } from '../src/jobs/weekly-review';
import { createLogger } from '../src/log';
import { TenantRouter } from '../src/runtime/tenant-router';

const state = vi.hoisted(() => ({
  adminScopes: 0,
  tenantScopes: [] as string[],
  activeTenantScopes: new Set<string>(),
  preEmitsInScope: [] as boolean[],
  postEmitsInScope: [] as boolean[],
  weeklyEmitsInScope: [] as boolean[],
}));

vi.mock('@kestrel/db', () => ({
  getActiveUserIds: vi.fn(async () => ['u1', 'u2']),
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

vi.mock('@kestrel/ai', () => ({
  findHighImpactEventsInWindow: vi.fn(async (args: { requireActual?: boolean }) =>
    args.requireActual ? [{ id: 'post-1' }] : [{ id: 'pre-1' }],
  ),
  listEmittedEventIds: vi.fn(async () => new Set<string>()),
  emitPreEvent: vi.fn(async (userId: string) => {
    state.preEmitsInScope.push(state.activeTenantScopes.has(userId));
    return { emitted: true };
  }),
  emitPostEvent: vi.fn(async (userId: string) => {
    state.postEmitsInScope.push(state.activeTenantScopes.has(userId));
    return { emitted: true };
  }),
  emitWeeklyReview: vi.fn(async (userId: string) => {
    state.weeklyEmitsInScope.push(state.activeTenantScopes.has(userId));
    return { emitted: true };
  }),
}));

const log = createLogger({ service: 'test', forceJson: true });
const tenantRouter = new TenantRouter();

function ctx() {
  return { log, signal: new AbortController().signal, tenantRouter };
}

beforeEach(() => {
  state.adminScopes = 0;
  state.tenantScopes = [];
  state.activeTenantScopes.clear();
  state.preEmitsInScope = [];
  state.postEmitsInScope = [];
  state.weeklyEmitsInScope = [];
});

describe('worker cron fan-out — RLS scope parity with the web fallback', () => {
  it('briefings discovers users via withAdminDb and emits inside withUserTenant', async () => {
    const result = await runBriefings(ctx());

    expect(state.adminScopes).toBe(1);
    expect(state.tenantScopes).toEqual(['u1', 'u2']);
    // Every emit ran while its own user's tenant scope was active.
    expect(state.preEmitsInScope).toEqual([true, true]);
    expect(state.postEmitsInScope).toEqual([true, true]);
    expect(result.processed).toBe(2);
    // Two users × one candidate per window = 2 emits against 1 candidate.
    expect(result.note).toMatch(/pre=2\/1/);
    expect(result.note).toMatch(/post=2\/1/);
  });

  it('weekly-review discovers users via withAdminDb and emits inside withUserTenant', async () => {
    const result = await runWeeklyReview(ctx());

    expect(state.adminScopes).toBe(1);
    expect(state.tenantScopes).toEqual(['u1', 'u2']);
    expect(state.weeklyEmitsInScope).toEqual([true, true]);
    expect(result.processed).toBe(2);
  });
});
