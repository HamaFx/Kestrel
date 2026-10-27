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

// The push-subscription handoff is the one path that can silently kill alerts:
// if a rotated subscription is dropped (or the session-less retry is skipped)
// the user stops receiving pushes with no visible error. Previously untested.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { syncPendingPushSubscription } from '@/lib/pwa/push-store';

const fetchCsrf = vi.fn();

vi.mock('@/lib/auth/csrf', () => ({
  fetchCsrf: (...args: unknown[]) => fetchCsrf(...args),
}));

/** IndexedDB stand-in that records what the store does to the handoff record. */
function installFakeIndexedDb() {
  const stores = new Map<string, Map<string, unknown>>();

  const dbFor = (name: string) => {
    let data = stores.get(name);
    if (!data) {
      data = new Map<string, unknown>();
      stores.set(name, data);
    }
    return data;
  };

  const fake = {
    open(name: string) {
      const request: Record<string, unknown> = {};
      queueMicrotask(() => {
        const data = dbFor(name);
        request.result = {
          objectStoreNames: { contains: (store: string) => data.has(`#${store}`) },
          createObjectStore: (store: string) => data.set(`#${store}`, new Map()),
          transaction: (_store: string) => {
            const tx: Record<string, unknown> = {};
            tx.objectStore = () => ({
              get: (key: string) => {
                const result = { result: data.get(key) };
                queueMicrotask(() => (result as { onsuccess?: () => void }).onsuccess?.());
                return result;
              },
              delete: (key: string) => {
                data.delete(key);
              },
            });
            return tx;
          },
          close: () => {},
        };
        (request.onupgradeneeded as (() => void) | undefined)?.();
        (request.onsuccess as (() => void) | undefined)?.();
      });
      return request;
    },
  };

  Object.defineProperty(globalThis, 'indexedDB', { value: fake, configurable: true });
  return stores;
}

const ROTATED = {
  endpoint: 'https://fcm.googleapis.com/wp/rotated',
  keys: { p256dh: 'p256dh-key', auth: 'auth-key' },
};

beforeEach(() => {
  fetchCsrf.mockReset();
});

afterEach(() => {
  Reflect.deleteProperty(globalThis, 'indexedDB');
});

describe('syncPendingPushSubscription', () => {
  it('posts the rotated subscription and clears the handoff record', async () => {
    installFakeIndexedDb();
    fetchCsrf.mockResolvedValue(new Response(null, { status: 200 }));

    await expect(syncPendingPushSubscription(ROTATED)).resolves.toBe(true);

    expect(fetchCsrf).toHaveBeenCalledWith(
      '/api/push/subscribe',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          endpoint: ROTATED.endpoint,
          keys: { p256dh: 'p256dh-key', auth: 'auth-key' },
        }),
      }),
    );
  });

  it('keeps the record when the session or CSRF token is gone', async () => {
    // 401/403 → retry on the next signed-in visit instead of losing the
    // subscription silently.
    installFakeIndexedDb();
    fetchCsrf.mockResolvedValue(new Response(null, { status: 401 }));

    await expect(syncPendingPushSubscription(ROTATED)).resolves.toBe(false);
  });

  it('keeps the record when the request throws', async () => {
    installFakeIndexedDb();
    fetchCsrf.mockRejectedValue(new Error('offline'));

    await expect(syncPendingPushSubscription(ROTATED)).resolves.toBe(false);
  });

  it('ignores an incomplete subscription and reports success', async () => {
    installFakeIndexedDb();

    await expect(syncPendingPushSubscription({ endpoint: ROTATED.endpoint })).resolves.toBe(true);
    expect(fetchCsrf).not.toHaveBeenCalled();
  });

  it('is a no-op without IndexedDB (private mode, SSR)', async () => {
    Reflect.deleteProperty(globalThis, 'indexedDB');

    await expect(syncPendingPushSubscription(null)).resolves.toBe(true);
    expect(fetchCsrf).not.toHaveBeenCalled();
  });
});
