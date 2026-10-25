// SPDX-License-Identifier: Apache-2.0
// PWA install detection: standalone/iOS sniffing, the deferred
// beforeinstallprompt event, and the localStorage dismiss cap.

import { useEffect, useState } from 'react';

const STORAGE_KEY = 'kestrel:install-dismissed';
const LEGACY_STORAGE_KEY = 'hfx_install_dismissed';
const DISMISS_CAP = 3;

interface BeforeInstallPromptEvent extends Event {
  /** Chrome-defined shape. We don't use any of its members but the
   *  TS DOM lib does not include them, so we declare the minimum. */
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function useInstallDetection() {
  const [hydrated, setHydrated] = useState(false);
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    setHydrated(true);

    // Already installed (PWA launched from home screen)?
    const standalone =
      typeof window !== 'undefined' &&
      (window.matchMedia('(display-mode: standalone)').matches ||
        // iOS-specific marker
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (navigator as any).standalone === true);
    if (standalone) {
      setInstalled(true);
      return;
    }

    // iOS/iPadOS 13+ detection: userAgent contains iPhone/iPad/iPod OR Macintosh with touch support
    const ua = navigator.userAgent;
    const isMac = /Macintosh/.test(ua);
    const isTouch = 'ontouchend' in window || navigator.maxTouchPoints > 0;
    const isiOS = /iPhone|iPad|iPod/.test(ua) || (isMac && isTouch);
    setIsIOS(isiOS);

    // Dismiss cap.
    try {
      const raw =
        window.localStorage.getItem(STORAGE_KEY) ?? window.localStorage.getItem(LEGACY_STORAGE_KEY);
      const count = raw ? Number(raw) : 0;
      if (Number.isFinite(count) && count >= DISMISS_CAP) setDismissed(true);
      if (raw !== null && window.localStorage.getItem(STORAGE_KEY) === null) {
        window.localStorage.setItem(STORAGE_KEY, raw);
        window.localStorage.removeItem(LEGACY_STORAGE_KEY);
      }
    } catch {
      /* localStorage may be unavailable in private mode */
    }

    // Chrome / Edge / Android: capture the deferred prompt.
    function onBeforeInstall(e: Event) {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstall);

    function onAppInstalled() {
      setInstalled(true);
      setDeferred(null);
    }
    window.addEventListener('appinstalled', onAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, []);

  function bumpDismiss() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      const next = (Number(raw) || 0) + 1;
      window.localStorage.setItem(STORAGE_KEY, String(next));
    } catch {
      /* ignore */
    }
  }

  async function onInstall() {
    if (!deferred) return;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    if (outcome === 'accepted') {
      setInstalled(true);
    }
    setDeferred(null);
    bumpDismiss();
  }

  function onDismiss() {
    setDismissed(true);
    bumpDismiss();
  }

  return { hydrated, deferred, installed, isIOS, dismissed, onInstall, onDismiss };
}
