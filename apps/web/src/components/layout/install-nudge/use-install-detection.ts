'use client';

// SPDX-License-Identifier: Apache-2.0
//
// Install detection for the "Add to Home Screen" nudge.
//
// Combines three client-only signals:
//   1. the deferred `beforeinstallprompt` event (Chromium),
//   2. standalone / `appinstalled` detection (is it already installed?),
//   3. the progressive-snooze preference + engagement gate, so the passive
//      nudge only appears after the user has actually used the app.
//
// `/settings/install` reuses the same hook with `gate: false` so an explicit
// "tell me how to install" request always works.
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

import {
  engagementRemainingMs,
  isOfferable,
  markInstalled,
  readInstallPreference,
  recordDismissal,
  registerEngagementOnce,
} from '@/lib/pwa/install-preference';
import { displayMode, isStandalone, platform, type Platform } from '@/lib/pwa/platform-detect';

interface BeforeInstallPromptEvent extends Event {
  /** Chrome-defined shape. The TS DOM lib does not include it. */
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export interface InstallDetection {
  /** False during SSR and the first paint — never render before this. */
  hydrated: boolean;
  /** Running as an installed app. */
  installed: boolean;
  /** A native Chromium install prompt is available. */
  canPrompt: boolean;
  /** The preference + engagement gate allow showing the nudge. */
  offerable: boolean;
  platform: Platform;
  displayMode: ReturnType<typeof displayMode>;
  /** Trigger the native install prompt. */
  promptInstall: () => void;
  /** Hide the nudge: progressively snoozed (3 days → 14 days → permanent). */
  dismiss: () => void;
}

export interface InstallDetectionOptions {
  /**
   * Apply the engagement gate and the snooze preference. The passive nudge
   * keeps this on; `/settings/install` turns it off so the user can always ask
   * for the install flow explicitly, even after a permanent dismissal.
   */
  gate?: boolean;
}

export function useInstallDetection(options: InstallDetectionOptions = {}): InstallDetection {
  const { gate = true } = options;
  const [hydrated, setHydrated] = useState(false);
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [offerable, setOfferable] = useState(false);

  // Detection: installed state, the deferred prompt, and appinstalled.
  useEffect(() => {
    setHydrated(true);

    if (isStandalone()) {
      // Already launched from the home screen: record it once so the nudge and
      // settings card stop asking.
      markInstalled();
      setInstalled(true);
    } else if (readInstallPreference().installedAt) {
      setInstalled(true);
    }

    const onBeforeInstall = (event: Event): void => {
      // Hold the event and decide when to surface it ourselves.
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
    };
    const onAppInstalled = (): void => {
      markInstalled();
      setInstalled(true);
      setDeferred(null);
      toast.success('Kestrel installed', {
        description: 'Open it from your home screen any time.',
      });
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onAppInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, []);

  // Gating: when, if ever, the passive nudge is allowed to appear.
  useEffect(() => {
    if (!gate) {
      setOfferable(!installed);
      return;
    }
    if (installed) {
      setOfferable(false);
      return;
    }

    const engagement = registerEngagementOnce();
    const evaluate = (): void => {
      setOfferable(isOfferable(readInstallPreference()) && engagementRemainingMs(engagement) === 0);
    };
    evaluate();

    // First visit: reveal the nudge once the engagement gate elapses.
    const remaining = engagementRemainingMs(engagement);
    if (remaining <= 0) return;
    const timer = window.setTimeout(evaluate, remaining);
    return () => window.clearTimeout(timer);
  }, [gate, installed]);

  const promptInstall = useCallback(() => {
    if (!deferred) return;
    void (async () => {
      await deferred.prompt();
      const { outcome } = await deferred.userChoice;
      setDeferred(null);
      if (outcome === 'accepted') {
        markInstalled();
        setInstalled(true);
        setOfferable(false);
        return;
      }
      // Declining the browser dialog is a soft no: snooze, don't nag.
      recordDismissal();
      setOfferable(false);
    })();
  }, [deferred]);

  const dismiss = useCallback(() => {
    recordDismissal();
    setOfferable(false);
  }, []);

  return {
    hydrated,
    installed,
    canPrompt: deferred !== null,
    offerable,
    platform: platform(),
    displayMode: displayMode(),
    promptInstall,
    dismiss,
  };
}
