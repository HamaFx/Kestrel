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

// SPDX-License-Identifier: Apache-2.0

// Audit 2026-10-31 (R7): the cleanup cron used to list bare `YYYY-MM-DD`
// prefixes while objects live at `<userId>/<YYYY-MM-DD>/<file>`, so it never
// deleted anything. These tests drive the sweep against a fake Supabase
// Storage listing built from the uploader's own path builder, and assert the
// deletion payload, the retention boundary and the reported counts.

import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GET } from '@/app/api/cron/cleanup-uploads/route';
import { buildChatImageObjectPath, chatImageObjectPrefix } from '@/lib/http/chat-image-paths';
import { runUploadCleanup } from '@/lib/http/upload-cleanup';

const mocks = vi.hoisted(() => ({
  withCronAuth: vi.fn(),
  loadJournalReferences: vi.fn(),
}));

// Set before any import-time `getServerEnv()` call can cache an env snapshot
// without the storage configuration, and restored afterwards because plain
// `process.env` writes leak across files in a reused worker process.
const envBackup = vi.hoisted(() => {
  const backup = {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
  process.env.SUPABASE_URL = 'https://project.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';
  return backup;
});

vi.mock('@/lib/http/cron', () => ({
  withCronAuth: mocks.withCronAuth,
  getActiveUserIdsForCron: vi.fn(),
}));

vi.mock('@/app/api/cron/cleanup-uploads/journal-references', () => ({
  loadJournalReferences: mocks.loadJournalReferences,
}));

vi.mock('@/lib/logger', () => ({
  createScopedLoggerWithContext: () => ({
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  }),
}));

const USER_A = 'user-a';
const USER_B = 'user-b';

/**
 * Journal-reference loader stub for direct sweep calls. The route-level tests
 * use the mocked `loadJournalReferences` module instead.
 */
function noJournalReferences(): {
  references: string[];
  truncated: boolean;
} {
  return { references: [], truncated: false };
}

/** Every fixture object is built by the uploader's own path builder. */
const uploadedPaths = [
  buildChatImageObjectPath(USER_A, 'first.webp', new Date('2026-10-15T10:00:00Z')),
  buildChatImageObjectPath(USER_A, 'second.webp', new Date('2026-10-15T11:00:00Z')),
  buildChatImageObjectPath(USER_A, 'boundary.webp', new Date('2026-10-25T09:00:00Z')),
  buildChatImageObjectPath(USER_A, 'recent.webp', new Date('2026-11-01T08:00:00Z')),
  buildChatImageObjectPath(USER_B, 'old.webp', new Date('2026-10-10T08:00:00Z')),
];

function segmentsOf(path: string): [string, string, string] {
  const [userId, day, name] = path.split('/') as [string, string, string];
  return [userId, day, name];
}

/** Folder/object listing keyed by the prefix the cron asks for. */
function buildListing(): Record<string, Array<{ name: string; id: string | null }>> {
  const listing: Record<string, Array<{ name: string; id: string | null }>> = { '': [] };
  for (const path of uploadedPaths) {
    const [userId, day, name] = segmentsOf(path);
    const userPrefix = chatImageObjectPrefix(userId);
    const dayPrefix = chatImageObjectPrefix(userId, day);
    if (!listing['']!.some((entry) => entry.name === userId)) {
      listing['']!.push({ name: userId, id: null });
    }
    listing[userPrefix] ??= [];
    if (!listing[userPrefix]!.some((entry) => entry.name === day)) {
      listing[userPrefix]!.push({ name: day, id: null });
    }
    listing[dayPrefix] ??= [];
    listing[dayPrefix]!.push({ name, id: `object-${name}` });
  }
  return listing;
}

const deletedBatches: string[][] = [];

function installStorageMock(): ReturnType<typeof vi.spyOn> {
  const listing = buildListing();
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(String(input));
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};

    if (url.pathname === '/storage/v1/object/list/chat-images') {
      const prefix = typeof body.prefix === 'string' ? body.prefix : '';
      const entries = listing[prefix] ?? [];
      return Response.json(entries.slice(0, Number(body.limit ?? 100)));
    }

    if (init?.method === 'DELETE' && url.pathname === '/storage/v1/object/chat-images') {
      const prefixes = Array.isArray(body.prefixes) ? (body.prefixes as string[]) : [];
      deletedBatches.push(prefixes);
      return Response.json([]);
    }

    return new Response('unexpected upstream call', { status: 500 });
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
  deletedBatches.length = 0;
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-01T12:00:00Z'));
  process.env.SUPABASE_URL = 'https://project.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';
  mocks.withCronAuth.mockImplementation(
    async (_req: Request, fn: (ctx: unknown) => Promise<unknown>) =>
      Response.json({ ok: true, ...((await fn({ via: 'bearer', userId: null })) as object) }),
  );
  mocks.loadJournalReferences.mockResolvedValue(noJournalReferences());
});

afterEach(() => {
  vi.useRealTimers();
});

afterAll(() => {
  for (const [key, value] of Object.entries(envBackup)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe('runUploadCleanup', () => {
  it('deletes every day folder at or before the retention cutoff', async () => {
    installStorageMock();

    const summary = await runUploadCleanup({
      supabaseUrl: 'https://project.supabase.co',
      serviceRoleKey: 'service-role-key',
      loadJournalReferences: async () => noJournalReferences(),
    });

    expect(summary).toMatchObject({
      deleted: 4,
      usersScanned: 2,
      dayFoldersExpired: 3,
      dayFoldersSwept: 3,
      journalReferencedKept: 0,
      journalUsersDeferred: 0,
      errors: 0,
      truncated: false,
      cutoffDay: '2026-10-25',
    });

    const deleted = new Set(deletedBatches.flat());
    expect(deleted).toEqual(
      new Set([uploadedPaths[0]!, uploadedPaths[1]!, uploadedPaths[2]!, uploadedPaths[4]!]),
    );
    // The day folder inside the retention window is untouched.
    expect(deleted.has(uploadedPaths[3]!)).toBe(false);
  });

  it('keeps an expired object a journal entry references, and deletes the rest', async () => {
    installStorageMock();

    const summary = await runUploadCleanup({
      supabaseUrl: 'https://project.supabase.co',
      serviceRoleKey: 'service-role-key',
      // Legacy public URL shape for the first upload: the sweep normalises it
      // with the uploader's own path parser.
      loadJournalReferences: async () =>
        ({
          references: [
            `https://project.supabase.co/storage/v1/object/public/chat-images/${uploadedPaths[0]!}`,
          ],
          truncated: false,
        }) as const,
    });

    const deleted = new Set(deletedBatches.flat());
    expect(deleted.has(uploadedPaths[0]!)).toBe(false);
    expect(deleted).toEqual(new Set([uploadedPaths[1]!, uploadedPaths[2]!, uploadedPaths[4]!]));
    expect(summary).toMatchObject({
      deleted: 3,
      journalReferencedKept: 1,
      journalUsersDeferred: 0,
    });
  });

  it('keeps a user’s expired objects when the reference lookup is truncated', async () => {
    installStorageMock();

    const summary = await runUploadCleanup({
      supabaseUrl: 'https://project.supabase.co',
      serviceRoleKey: 'service-role-key',
      loadJournalReferences: async (userId) =>
        userId === USER_A ? { references: [], truncated: true } : noJournalReferences(),
    });

    const deleted = new Set(deletedBatches.flat());
    // Truncation is a "cannot prove unreferenced" answer, so nothing in that
    // user's expired days is deleted; the other user is still swept.
    expect(deleted.has(uploadedPaths[0]!)).toBe(false);
    expect(deleted.has(uploadedPaths[1]!)).toBe(false);
    expect(deleted.has(uploadedPaths[2]!)).toBe(false);
    expect(deleted.has(uploadedPaths[4]!)).toBe(true);
    expect(summary).toMatchObject({
      deleted: 1,
      journalReferencedKept: 0,
      journalUsersDeferred: 1,
      errors: 0,
    });
  });

  it('keeps a user’s expired objects when the reference lookup fails', async () => {
    installStorageMock();

    const summary = await runUploadCleanup({
      supabaseUrl: 'https://project.supabase.co',
      serviceRoleKey: 'service-role-key',
      warn: () => {},
      loadJournalReferences: async (userId) => {
        if (userId === USER_A) throw new Error('database unavailable');
        return noJournalReferences();
      },
    });

    const deleted = new Set(deletedBatches.flat());
    expect(deleted.has(uploadedPaths[0]!)).toBe(false);
    expect(deleted.has(uploadedPaths[4]!)).toBe(true);
    expect(summary).toMatchObject({
      deleted: 1,
      journalUsersDeferred: 1,
      errors: 1,
    });
  });

  it('keeps going when one user prefix cannot be listed', async () => {
    const realFetch = installStorageMock();
    const original = realFetch.getMockImplementation()!;
    realFetch.mockImplementation(async (input, init) => {
      const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
      if (body.prefix === USER_B) return new Response('nope', { status: 500 });
      return original(input, init);
    });

    const summary = await runUploadCleanup({
      supabaseUrl: 'https://project.supabase.co',
      serviceRoleKey: 'service-role-key',
      loadJournalReferences: async () => noJournalReferences(),
      warn: () => {},
    });

    expect(summary.errors).toBe(1);
    expect(summary.deleted).toBe(3);
    expect(summary.usersScanned).toBe(1);
    const deleted = new Set(deletedBatches.flat());
    expect(deleted.has(uploadedPaths[4]!)).toBe(false);
  });

  it('stops at the deletion cap and reports the run as truncated', async () => {
    installStorageMock();

    const summary = await runUploadCleanup({
      supabaseUrl: 'https://project.supabase.co',
      serviceRoleKey: 'service-role-key',
      maxDeletes: 2,
      loadJournalReferences: async () => noJournalReferences(),
    });

    expect(summary.deleted).toBe(2);
    expect(summary.truncated).toBe(true);
  });

  it('never deletes past the budget within a single day folder', async () => {
    installStorageMock();

    const summary = await runUploadCleanup({
      supabaseUrl: 'https://project.supabase.co',
      serviceRoleKey: 'service-role-key',
      maxDeletes: 1,
      loadJournalReferences: async () => noJournalReferences(),
    });

    expect(summary.deleted).toBe(1);
    expect(summary.truncated).toBe(true);
    expect(deletedBatches.flat()).toHaveLength(1);
  });

  it('reports listing failures without throwing', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('down', { status: 503 }));

    const summary = await runUploadCleanup({
      supabaseUrl: 'https://project.supabase.co',
      serviceRoleKey: 'service-role-key',
      loadJournalReferences: async () => noJournalReferences(),
      warn: () => {},
    });

    expect(summary).toMatchObject({ deleted: 0, usersScanned: 0, errors: 1 });
  });
});

describe('GET /api/cron/cleanup-uploads', () => {
  it('reports what it deleted', async () => {
    installStorageMock();

    const response = await GET(new Request('http://localhost/api/cron/cleanup-uploads'));

    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      ok: true,
      processed: 4,
      deleted: 4,
      usersScanned: 2,
      dayFoldersSwept: 3,
      dayFoldersExpired: 3,
      journalReferencedKept: 0,
      journalUsersDeferred: 0,
      errors: 0,
      truncated: false,
      cutoffDay: '2026-10-25',
    });
    expect(String(body.note)).toContain('deleted=4');
    expect(String(body.note)).toContain('journalKept=0');
    expect(String(body.note)).toContain('journalDeferredUsers=0');
    expect(String(body.note)).toContain('retentionDays=7');
  });

  it('keeps a journal-referenced upload and reports it in the note', async () => {
    installStorageMock();
    mocks.loadJournalReferences.mockResolvedValue({
      references: [uploadedPaths[0]!],
      truncated: false,
    });

    const response = await GET(new Request('http://localhost/api/cron/cleanup-uploads'));

    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      processed: 3,
      deleted: 3,
      journalReferencedKept: 1,
      journalUsersDeferred: 0,
    });
    expect(String(body.note)).toContain('journalKept=1');
    const deleted = new Set(deletedBatches.flat());
    expect(deleted.has(uploadedPaths[0]!)).toBe(false);
    expect(mocks.loadJournalReferences).toHaveBeenCalledWith(USER_A, ['2026-10-15', '2026-10-25']);
  });
});
