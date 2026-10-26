'use client';

// SPDX-License-Identifier: Apache-2.0
//
// PWA runtime signals that are not service-worker registration:
//
//   1. App-icon badge — pushed alerts raise a badge; opening the app clears it.
//      The Badging API exists only in installed apps on some platforms, so we
//      feature-detect and never make behaviour depend on it.
//   2. Push re-sync — when the push service rotates a subscription the service
//      worker parks it in IndexedDB (it cannot read the session cookie or CSRF
//      token). This drains that record on the next foreground visit.
import { useEffect } from 'react';

import { syncPendingPushSubscription, type PushSubscriptionJson } from '@/lib/pwa/push-store';

export function PwaSignals(): null {
  useEffect(() => {
    const nav = navigator;
    if (typeof nav.clearAppBadge !== 'function') return;
    const clearWhenVisible = (): void => {
      if (document.visibilityState !== 'visible') return;
      void nav.clearAppBadge().catch(() => {});
    };
    clearWhenVisible();
    document.addEventListener('visibilitychange', clearWhenVisible);
    return () => document.removeEventListener('visibilitychange', clearWhenVisible);
  }, []);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    if (!window.isSecureContext) return;

    // Anything the worker handed over while the app was closed.
    void syncPendingPushSubscription();

    const onMessage = (event: MessageEvent): void => {
      const data = event.data as { type?: string; subscription?: PushSubscriptionJson } | undefined;
      if (data?.type === 'PUSH_SUBSCRIPTION_CHANGED') {
        void syncPendingPushSubscription(data.subscription ?? null);
      }
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, []);

  return null;
}
