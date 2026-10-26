'use client';

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
import { useEffect } from 'react';
import { toast } from 'sonner';

import { isStandalone } from '@/lib/pwa/platform-detect';

/**
 * Registers the service worker once, deferred until the browser is idle so it
 * never competes with first paint, and owns the update conversation.
 *
 * Update policy (docs/pwa.md):
 *   - The SW stays in `waiting` until the app explicitly asks for the update,
 *     so a deploy can never swap chunks underneath a half-typed prompt.
 *   - Browser tab: a toast offers "Reload"; the reload happens only on click.
 *   - Installed app: there is no reload button, so the update is applied the
 *     next time the app resumes from the background and a reload is safe.
 *   - The first activation never reloads: `clients.claim()` fires
 *     `controllerchange` for an uncontrolled page too, and reloading on it
 *     would loop on every first visit.
 *
 * Registration is fire-and-forget: failures are warned, never thrown.
 */
export function SwRegister(): null {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;
    if (!window.isSecureContext) return;

    // Did this page already start under a controller? Only then can a
    // controllerchange mean "an update took over".
    const controlledOnLoad = Boolean(navigator.serviceWorker.controller);
    let registration: ServiceWorkerRegistration | null = null;
    let lastUpdateCheck = Date.now();
    let updateOffered = false;
    let reloading = false;

    const applyWaiting = (): void => {
      registration?.waiting?.postMessage({ type: 'SKIP_WAITING' });
    };

    const offerUpdate = (): void => {
      if (!controlledOnLoad) return;
      if (isStandalone()) return; // applied on the next background resume
      if (updateOffered) return;
      updateOffered = true;
      toast.info('Update available', {
        action: { label: 'Reload', onClick: applyWaiting },
        duration: 10_000,
      });
    };

    const handleControllerChange = (): void => {
      // One reload per page, and only for pages that were already controlled.
      if (!controlledOnLoad || reloading) return;
      reloading = true;
      window.location.reload();
    };

    const checkForUpdate = (): void => {
      lastUpdateCheck = Date.now();
      void registration?.update().catch(() => {});
    };

    const handleVisibilityChange = (): void => {
      if (document.visibilityState !== 'visible') return;
      if (registration?.waiting) {
        // Installed app resuming with a pending update: the reload is safe
        // here because the user is looking at a fresh resume, not an edit.
        if (isStandalone()) {
          applyWaiting();
          return;
        }
        offerUpdate();
        return;
      }
      // Cheap throttle: at most one update probe per 15 minutes of use.
      if (Date.now() - lastUpdateCheck > 15 * 60 * 1000) checkForUpdate();
    };

    const register = (): void => {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/' })
        .then((reg) => {
          registration = reg;
          checkForUpdate();

          if (reg.waiting) offerUpdate();

          reg.addEventListener('updatefound', () => {
            const incoming = reg.installing;
            incoming?.addEventListener('statechange', () => {
              // `installed` + an existing controller means an update is ready
              // and waiting for permission to activate.
              if (incoming.state === 'installed' && navigator.serviceWorker.controller) {
                offerUpdate();
              }
            });
          });
        })
        .catch((err: unknown) => {
          console.warn('[sw] register failed', err);
        });
    };

    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    let cancelIdle: (() => void) | undefined;
    if (typeof window.requestIdleCallback === 'function') {
      const id = window.requestIdleCallback(register);
      cancelIdle = () => window.cancelIdleCallback(id);
    } else {
      const timer = window.setTimeout(register, 200);
      cancelIdle = () => window.clearTimeout(timer);
    }

    return () => {
      cancelIdle?.();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
    };
  }, []);

  return null;
}
