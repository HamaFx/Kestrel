// SPDX-License-Identifier: Apache-2.0
//
// Push-subscription handoff between the service worker and the app.
//
// When a push service rotates a subscription the SW re-subscribes itself and
// parks the new subscription in IndexedDB, because POST /api/push/subscribe is
// session + CSRF protected and a service worker can read neither. This module
// is the foreground half: it drains that record with a normal authenticated
// `fetch`.
//
// Store names are shared with `scripts/sw.template.js` — change both together.

import { fetchCsrf } from '@/lib/auth/csrf';

const PUSH_DB = 'kestrel-pwa';
const PUSH_STORE = 'push-state';
const PENDING_KEY = 'pending-subscription';

export interface PushSubscriptionJson {
  endpoint?: string | null;
  keys?: { p256dh?: string | null; auth?: string | null } | null;
}

function openPushDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(PUSH_DB, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(PUSH_STORE)) {
        request.result.createObjectStore(PUSH_STORE);
      }
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

export async function readPendingPushSubscription(): Promise<PushSubscriptionJson | null> {
  if (typeof indexedDB === 'undefined') return null;
  try {
    const db = await openPushDb();
    const value = await new Promise<PushSubscriptionJson | null>((resolve, reject) => {
      const tx = db.transaction(PUSH_STORE, 'readonly');
      const get = tx.objectStore(PUSH_STORE).get(PENDING_KEY);
      get.onsuccess = () => resolve((get.result as PushSubscriptionJson | undefined) ?? null);
      get.onerror = () => reject(get.error);
    });
    db.close();
    return value;
  } catch {
    return null;
  }
}

export async function clearPendingPushSubscription(): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  try {
    const db = await openPushDb();
    const tx = db.transaction(PUSH_STORE, 'readwrite');
    tx.objectStore(PUSH_STORE).delete(PENDING_KEY);
    db.close();
  } catch {
    /* the record stays until the next attempt */
  }
}

/**
 * Register a rotated subscription with the server. Returns true when it was
 * accepted (or there was nothing to do).
 */
export async function syncPendingPushSubscription(
  subscription?: PushSubscriptionJson | null,
): Promise<boolean> {
  const pending = subscription ?? (await readPendingPushSubscription());
  const endpoint = pending?.endpoint;
  const p256dh = pending?.keys?.p256dh;
  const auth = pending?.keys?.auth;
  if (!endpoint || !p256dh || !auth) {
    if (pending) await clearPendingPushSubscription();
    return true;
  }

  try {
    const res = await fetchCsrf('/api/push/subscribe', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ endpoint, keys: { p256dh, auth } }),
    });
    if (res.ok) {
      await clearPendingPushSubscription();
      return true;
    }
    // 401/403 → the session or CSRF token is gone; keep the record so the next
    // signed-in visit can retry instead of silently losing the subscription.
    return false;
  } catch {
    return false;
  }
}
