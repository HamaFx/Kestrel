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

// Phase 3 Task 2 — the BYOK vault writer is the single owner of the
// decrypt/merge/encrypt sequence. These tests pin the preservation rules that
// the five former per-surface implementations disagreed about.

import { decryptByok, encryptByok, type ByokPayload } from '@kestrel/shared/encryption';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type * as clientModule from '../src/client';
import {
  applyUserByokPatch,
  mergeUserByokKeys,
  removeUserByokKey,
  type UserByokState,
} from '../src/queries/user-byok';

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  requireTenantIdForUser: vi.fn(),
}));

// The BYOK writer loads the server-only encryption module; this suite runs
// outside a React Server Component bundle.
vi.mock('server-only', () => ({}));

vi.mock('../src/client', async (importOriginal) => {
  const actual = await importOriginal<typeof clientModule>();
  return { ...actual, getDb: mocks.getDb };
});

vi.mock('../src/tenant', () => ({
  requireTenantIdForUser: mocks.requireTenantIdForUser,
}));

const CHANGED_AT = '2026-11-02T10:00:00.000Z';

beforeEach(() => {
  process.env.ENCRYPTION_SECRET = 'a'.repeat(64);
  mocks.requireTenantIdForUser.mockReset().mockResolvedValue('tenant-1');
});

describe('applyUserByokPatch', () => {
  const state: UserByokState = {
    keys: { openai: 'sk-old', anthropic: 'sk-ant', opencode: 'jev-key', finnhub: 'fh-key' },
    updatedAt: {
      openai: '2026-10-01T00:00:00.000Z',
      anthropic: '2026-10-02T00:00:00.000Z',
      opencode: '2026-10-03T00:00:00.000Z',
      finnhub: '2026-10-04T00:00:00.000Z',
    },
  };

  it('only touches providers named by the patch', () => {
    const result = applyUserByokPatch(state, { set: { openai: 'sk-new' } }, CHANGED_AT);

    expect(result.keys).toEqual({
      openai: 'sk-new',
      anthropic: 'sk-ant',
      opencode: 'jev-key',
      finnhub: 'fh-key',
    });
    expect(result.changed).toEqual(['openai']);
    expect(result.removed).toEqual([]);
    expect(result.updatedAt.openai).toBe(CHANGED_AT);
    expect(result.updatedAt.anthropic).toBe('2026-10-02T00:00:00.000Z');
  });

  it('treats an empty set value as a removal', () => {
    const result = applyUserByokPatch(state, { set: { openai: '   ' } }, CHANGED_AT);

    expect(result.keys.openai).toBeUndefined();
    expect(result.removed).toEqual(['openai']);
    expect(result.updatedAt.openai).toBeUndefined();
  });

  it('removes providers listed in remove', () => {
    const result = applyUserByokPatch(state, { remove: ['anthropic'] }, CHANGED_AT);

    expect(result.keys.anthropic).toBeUndefined();
    expect(result.removed).toEqual(['anthropic']);
    expect(result.updatedAt.anthropic).toBeUndefined();
  });

  it('replace drops unmentioned keys but keeps preserve', () => {
    const result = applyUserByokPatch(
      state,
      { set: { openai: 'sk-imported' }, replace: true, preserve: ['opencode', 'finnhub'] },
      CHANGED_AT,
    );

    expect(result.keys).toEqual({
      openai: 'sk-imported',
      opencode: 'jev-key',
      finnhub: 'fh-key',
    });
    expect(result.changed).toEqual(['openai']);
    expect(result.removed).toEqual(['anthropic']);
  });

  it('keeps the stored change time for unchanged keys and stamps new ones', () => {
    const result = applyUserByokPatch(state, { set: { groq: 'gsk-new' } }, CHANGED_AT);

    expect(result.updatedAt.groq).toBe(CHANGED_AT);
    expect(result.updatedAt.openai).toBe('2026-10-01T00:00:00.000Z');
  });

  it('trims submitted values', () => {
    const result = applyUserByokPatch(state, { set: { openai: '  sk-trimmed  ' } }, CHANGED_AT);
    expect(result.keys.openai).toBe('sk-trimmed');
  });
});

interface CapturedWrite {
  set?: Record<string, unknown>;
}

function fakeTransactionalDb(
  row: Record<string, unknown> | null,
  capture: CapturedWrite,
): clientModule.DbClient {
  const tx = {
    select: () => ({
      from: () => ({
        where: () => Promise.resolve(row ? [row] : []),
      }),
    }),
    update: () => ({
      set: (values: Record<string, unknown>) => {
        capture.set = values;
        return { where: () => Promise.resolve() };
      },
    }),
  };
  return {
    transaction: async (work: (client: unknown) => Promise<unknown>) => work(tx),
  } as unknown as clientModule.DbClient;
}

describe('mergeUserByokKeys', () => {
  it('merges, encrypts, and exposes the result to the same-transaction hook', async () => {
    const capture: CapturedWrite = {};
    const stored = encryptByok({ openai: 'sk-old', anthropic: 'sk-ant' });
    mocks.getDb.mockReturnValue(
      fakeTransactionalDb({ aiApiKeys: stored, aiApiKeysUpdatedAt: {} }, capture),
    );

    const afterWrite = vi.fn().mockResolvedValue(undefined);
    const result = await mergeUserByokKeys(
      'user-1',
      { set: { openai: 'sk-new' } },
      { changedAt: CHANGED_AT, afterWrite },
    );

    expect(result.keys).toEqual({ openai: 'sk-new', anthropic: 'sk-ant' });
    expect(afterWrite).toHaveBeenCalledWith(expect.anything(), result);

    const written = capture.set?.aiApiKeys;
    expect(typeof written).toBe('string');
    expect(decryptByok(written as string)).toEqual({ openai: 'sk-new', anthropic: 'sk-ant' });
    expect(capture.set?.aiApiKeysUpdatedAt).toEqual({
      openai: CHANGED_AT,
      anthropic: CHANGED_AT,
    });
  });

  it('writes NULL when the patch removes the last key', async () => {
    const capture: CapturedWrite = {};
    mocks.getDb.mockReturnValue(
      fakeTransactionalDb({ aiApiKeys: encryptByok({ openai: 'sk-only' }) }, capture),
    );

    await mergeUserByokKeys('user-1', { remove: ['openai'] }, { changedAt: CHANGED_AT });

    expect(capture.set?.aiApiKeys).toBeNull();
    expect(capture.set?.aiApiKeysUpdatedAt).toBeNull();
  });
});

describe('removeUserByokKey', () => {
  it('delegates to the merge writer', async () => {
    const capture: CapturedWrite = {};
    mocks.getDb.mockReturnValue(
      fakeTransactionalDb({ aiApiKeys: encryptByok({ openai: 'sk-only' }) }, capture),
    );

    const result = await removeUserByokKey('user-1', 'openai');

    expect(result.keys).toEqual({} satisfies ByokPayload);
    expect(result.removed).toEqual(['openai']);
    expect(mocks.requireTenantIdForUser).toHaveBeenCalledWith('user-1', expect.anything());
  });
});
