// @vitest-environment node
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

// Audit 2026-10-31 (R1): the chat landing route calls the thread persistence
// helpers through `@/lib/services/api-boundary`, so the text-level RSC guard
// cannot see the `chat_threads` reads. These tests pin the runtime contract
// instead: every createThread/listThreads call happens inside
// `withUserTenant`, and the redirect target is unchanged.

import { beforeEach, describe, expect, it, vi } from 'vitest';

import ChatLanding from '@/app/(app)/chat/page';

const mocks = vi.hoisted(() => ({
  events: [] as string[],
  auth: vi.fn(),
  redirect: vi.fn(),
  withUserTenant: vi.fn(),
  createThread: vi.fn(),
  listThreads: vi.fn(),
}));

vi.mock('@/auth', () => ({ auth: mocks.auth }));
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }));
vi.mock('@kestrel/db', () => ({ withUserTenant: mocks.withUserTenant }));
vi.mock('@/lib/services/api-boundary', () => ({
  createThread: mocks.createThread,
  listThreads: mocks.listThreads,
}));

class RedirectSignal extends Error {
  constructor(readonly url: string) {
    super(`redirect:${url}`);
  }
}

async function render(searchParams: Record<string, string>): Promise<string> {
  try {
    await ChatLanding({ searchParams: Promise.resolve(searchParams) });
  } catch (err) {
    if (err instanceof RedirectSignal) return err.url;
    throw err;
  }
  throw new Error('expected a redirect');
}

describe('chat landing route scope (audit 2026-10-31 R1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.events.length = 0;

    mocks.auth.mockResolvedValue({ user: { id: 'user-1' } });
    mocks.redirect.mockImplementation((url: string) => {
      mocks.events.push(`redirect:${url}`);
      throw new RedirectSignal(url);
    });
    mocks.withUserTenant.mockImplementation(
      async (userId: string, work: () => Promise<unknown>) => {
        mocks.events.push(`tenant:enter:${userId}`);
        const result = await work();
        mocks.events.push(`tenant:exit:${userId}`);
        return result;
      },
    );
    mocks.createThread.mockImplementation(async () => {
      mocks.events.push('createThread');
      return { id: 'thread-new' };
    });
    mocks.listThreads.mockImplementation(async () => {
      mocks.events.push('listThreads');
      return { threads: [{ id: 'thread-old' }] };
    });
  });

  it('creates the prompt thread inside the tenant scope', async () => {
    const url = await render({ prompt: 'hi' });

    expect(url).toBe('/chat/thread-new?prompt=hi');
    expect(mocks.withUserTenant).toHaveBeenCalledWith('user-1', expect.any(Function));
    expect(mocks.events).toEqual([
      'tenant:enter:user-1',
      'createThread',
      'tenant:exit:user-1',
      'redirect:/chat/thread-new?prompt=hi',
    ]);
  });

  it('redirects to the most recent thread read inside the tenant scope', async () => {
    const url = await render({});

    expect(url).toBe('/chat/thread-old');
    expect(mocks.withUserTenant).toHaveBeenCalledWith('user-1', expect.any(Function));
    expect(mocks.events).toEqual([
      'tenant:enter:user-1',
      'listThreads',
      'tenant:exit:user-1',
      'redirect:/chat/thread-old',
    ]);
  });

  it('keeps the list-then-create fallback in a single scope', async () => {
    mocks.listThreads.mockImplementation(async () => {
      mocks.events.push('listThreads');
      return { threads: [] };
    });

    const url = await render({});

    expect(url).toBe('/chat/thread-new');
    expect(mocks.withUserTenant).toHaveBeenCalledTimes(1);
    expect(mocks.events).toEqual([
      'tenant:enter:user-1',
      'listThreads',
      'createThread',
      'tenant:exit:user-1',
      'redirect:/chat/thread-new',
    ]);
  });

  it('redirects unauthenticated visitors to login without touching the database', async () => {
    mocks.auth.mockResolvedValue(null);

    const url = await render({});

    expect(url).toBe('/login');
    expect(mocks.withUserTenant).not.toHaveBeenCalled();
    expect(mocks.createThread).not.toHaveBeenCalled();
    expect(mocks.listThreads).not.toHaveBeenCalled();
  });
});
