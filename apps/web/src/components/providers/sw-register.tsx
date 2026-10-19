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

/**
 * Registers the service worker once, deferred until the browser is idle so we
 * don't compete with first paint. Fire-and-forget: failures are warned, never
 * thrown — registration is best-effort. See design §6.
 */
export function SwRegister(): null {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;
    if (!window.isSecureContext) return;

    const register = (): void => {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/' })
        .then((reg) => {
          // Proactively check for updates on mount
          reg.update().catch(() => {});

          reg.addEventListener('updatefound', () => {
            const newWorker = reg.installing;
            newWorker?.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                // In standalone PWA mode (e.g. iOS Home Screen), auto-activate and refresh
                // so users without an address bar / refresh button get latest updates
                const isStandalone =
                  window.matchMedia('(display-mode: standalone)').matches ||
                  Boolean((navigator as unknown as { standalone?: boolean }).standalone);

                if (isStandalone) {
                  newWorker.postMessage({ type: 'SKIP_WAITING' });
                  window.location.reload();
                  return;
                }

                toast.info('Update available', {
                  action: {
                    label: 'Reload',
                    onClick: () => {
                      newWorker.postMessage({ type: 'SKIP_WAITING' });
                      window.location.reload();
                    },
                  },
                  duration: 10000,
                });
              }
            });
          });
        })
        .catch((err: unknown) => {
          console.warn('[sw] register failed', err);
        });
    };

    // Check for updates when user returns to app (e.g. switching back to iOS Home Screen app)
    const handleVisibilityChange = (): void => {
      if (document.visibilityState === 'visible') {
        navigator.serviceWorker.getRegistration().then((reg) => {
          reg?.update().catch(() => {});
        });
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Auto-reload in standalone PWA when controller changes
    const handleControllerChange = (): void => {
      const isStandalone =
        window.matchMedia('(display-mode: standalone)').matches ||
        Boolean((navigator as unknown as { standalone?: boolean }).standalone);
      if (isStandalone) {
        window.location.reload();
      }
    };
    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);

    if (typeof window.requestIdleCallback === 'function') {
      const id = window.requestIdleCallback(register);
      return () => {
        if (typeof window.cancelIdleCallback === 'function') {
          window.cancelIdleCallback(id);
        }
        document.removeEventListener('visibilitychange', handleVisibilityChange);
        navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
      };
    }
    const t = window.setTimeout(register, 200);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
    };
  }, []);
  return null;
}
