// SPDX-License-Identifier: Apache-2.0
//
// Periodic Background Sync registration (foreground half).
//
// An installed app that is rarely opened never discovers a deploy: the update
// check lives in the page, and the offline document is only refreshed while the
// app runs. Chromium's Periodic Background Sync lets the service worker close
// that gap on its own schedule — see the `periodicsync` handler in
// `scripts/sw.template.js`.
//
// Only Chromium implements this (and only for installed apps with enough
// engagement), so every path here is best-effort: the caller gets a boolean for
// diagnostics and nothing ever throws into the registration flow.

/**
 * Tag the worker listens for. Mirrored in `scripts/sw.template.js` — change both
 * together.
 */
export const SHELL_REFRESH_TAG = 'kestrel-shell-refresh';

/** Minimum spacing the browser is asked to respect between refreshes. */
export const SHELL_REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000;

interface PeriodicSyncManagerLike {
  register(tag: string, options?: { minInterval?: number }): Promise<void>;
  unregister(tag: string): Promise<void>;
}

interface RegistrationWithPeriodicSync extends ServiceWorkerRegistration {
  periodicSync?: PeriodicSyncManagerLike;
}

/** True when this browser exposes Periodic Background Sync at all. */
export function supportsPeriodicSync(registration: ServiceWorkerRegistration): boolean {
  return (
    typeof (registration as RegistrationWithPeriodicSync).periodicSync?.register === 'function'
  );
}

/**
 * Ask the browser to run the shell refresh in the background.
 *
 * @returns true when the registration was accepted.
 */
export async function registerShellRefresh(
  registration: ServiceWorkerRegistration,
): Promise<boolean> {
  if (!supportsPeriodicSync(registration)) return false;

  // The permission is granted by the platform, not by a prompt: it reflects
  // install state + engagement. A browser that does not know the name throws,
  // which is not a reason to skip the attempt.
  try {
    const status = await navigator.permissions?.query({
      name: 'periodic-background-sync' as PermissionName,
    });
    if (status && status.state !== 'granted') return false;
  } catch {
    /* unknown permission name — try the registration anyway */
  }

  try {
    await (registration as RegistrationWithPeriodicSync).periodicSync?.register(SHELL_REFRESH_TAG, {
      minInterval: SHELL_REFRESH_INTERVAL_MS,
    });
    return true;
  } catch {
    // Denied (not installed, low engagement) — the in-page update check still
    // covers the user who actually opens the app.
    return false;
  }
}
