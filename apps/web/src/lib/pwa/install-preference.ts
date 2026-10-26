// SPDX-License-Identifier: Apache-2.0
//
// Install-nudge preference store.
//
// The previous implementation hard-capped dismissals at three and then stayed
// silent forever, with no way back. The model here is progressive snoozing plus
// a permanent opt-out that `/settings/install` can always override:
//
//   dismissal 1 → snooze 3 days
//   dismissal 2 → snooze 14 days
//   dismissal 3 → permanent (the user has said no; settings still offers it)
//
// The install *fact* is also recorded, because `appinstalled` / standalone
// detection is the only way to know the nudge has served its purpose.

const STORAGE_KEY = 'kestrel:pwa-install';
const LEGACY_DISMISS_KEY = 'kestrel:install-dismissed';
const LEGACY_DISMISS_KEY_V0 = 'hfx_install_dismissed';
const ENGAGEMENT_KEY = 'kestrel:pwa-engagement';

const SNOOZE_DAYS = [3, 14] as const;
export const PERMANENT_DISMISSAL_LIMIT = SNOOZE_DAYS.length + 1;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Engagement gate: a second visit, or a minute of real use. */
const MIN_SESSION_MS = 60_000;

export interface InstallPreference {
  /** How many times the user dismissed the nudge. */
  dismissedCount: number;
  /** Epoch ms before which the nudge must stay hidden. */
  snoozeUntil: number | null;
  /** Epoch ms when the app was detected as installed. */
  installedAt: number | null;
}

const EMPTY: InstallPreference = { dismissedCount: 0, snoozeUntil: null, installedAt: null };

function readJson<T>(key: string): T | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode / quota — the nudge simply falls back to in-memory state */
  }
}

/** One-time migration from the legacy numeric dismissal counters. */
function migrateLegacy(): Partial<InstallPreference> | null {
  if (typeof window === 'undefined') return null;
  const raw =
    window.localStorage.getItem(LEGACY_DISMISS_KEY) ??
    window.localStorage.getItem(LEGACY_DISMISS_KEY_V0);
  if (raw === null) return null;
  const count = Number(raw);
  try {
    window.localStorage.removeItem(LEGACY_DISMISS_KEY);
    window.localStorage.removeItem(LEGACY_DISMISS_KEY_V0);
  } catch {
    /* ignore */
  }
  if (!Number.isFinite(count) || count <= 0) return null;
  // A legacy count of three already means "stop showing" in the old model, so
  // keep it as a permanent dismissal rather than restarting the ladder.
  return { dismissedCount: Math.min(count, PERMANENT_DISMISSAL_LIMIT) };
}

export function readInstallPreference(): InstallPreference {
  const stored = readJson<Partial<InstallPreference>>(STORAGE_KEY);
  if (stored) return { ...EMPTY, ...stored };

  // First read after upgrading from the legacy counter: fold it in and persist
  // the converted record so the migration only ever runs once.
  const migrated = migrateLegacy();
  const merged: InstallPreference = { ...EMPTY, ...(migrated ?? {}) };
  if (migrated) writeJson(STORAGE_KEY, merged);
  return merged;
}

function updateInstallPreference(patch: Partial<InstallPreference>): InstallPreference {
  const next = { ...readInstallPreference(), ...patch };
  writeJson(STORAGE_KEY, next);
  return next;
}

export function markInstalled(): void {
  updateInstallPreference({ installedAt: Date.now(), snoozeUntil: null });
}

/** Record a dismissal and return the state after it (with the new snooze). */
export function recordDismissal(): InstallPreference {
  const current = readInstallPreference();
  const dismissedCount = current.dismissedCount + 1;
  const snoozeDays = SNOOZE_DAYS[dismissedCount - 1];
  return updateInstallPreference({
    dismissedCount,
    snoozeUntil: snoozeDays ? Date.now() + snoozeDays * DAY_MS : null,
  });
}

/** Hide the nudge until `until` without counting another dismissal. */
export function snooze(until: number): InstallPreference {
  return updateInstallPreference({ snoozeUntil: until });
}

/** True when the nudge may be shown again for the current preference. */
export function isOfferable(pref: InstallPreference, now = Date.now()): boolean {
  if (pref.installedAt) return false;
  if (pref.dismissedCount >= PERMANENT_DISMISSAL_LIMIT) return false;
  if (pref.snoozeUntil !== null && pref.snoozeUntil > now) return false;
  return true;
}

export interface EngagementState {
  /** Number of app loads seen on this device. */
  sessions: number;
  /** Epoch ms of the first load. */
  firstSeenAt: number;
}

export function readEngagement(): EngagementState {
  return readJson<EngagementState>(ENGAGEMENT_KEY) ?? { sessions: 0, firstSeenAt: Date.now() };
}

/** Register this app load (called once per session from the install hook). */
export function registerEngagement(now = Date.now()): EngagementState {
  const current = readJson<EngagementState>(ENGAGEMENT_KEY);
  const next: EngagementState = current
    ? { sessions: current.sessions + 1, firstSeenAt: current.firstSeenAt }
    : { sessions: 1, firstSeenAt: now };
  writeJson(ENGAGEMENT_KEY, next);
  return next;
}

/** Module-level cache so a re-mounting hook cannot count one visit twice. */
let sessionEngagement: EngagementState | null = null;

/** Idempotent per page load: the first caller registers, the rest reuse. */
export function registerEngagementOnce(now = Date.now()): EngagementState {
  sessionEngagement ??= registerEngagement(now);
  return sessionEngagement;
}

/**
 * Whether the user has shown enough intent for an install prompt. Asking on the
 * very first paint is the classic way to get dismissed forever, so the nudge
 * waits for a second visit or a minute of use.
 */
export function hasEngaged(engagement: EngagementState, now = Date.now()): boolean {
  return engagement.sessions >= 2 || now - engagement.firstSeenAt >= MIN_SESSION_MS;
}

/**
 * Milliseconds until {@link hasEngaged} becomes true for a first visit.
 * Returns 0 when the engagement gate is already satisfied — callers use it to
 * schedule a single re-check instead of polling.
 */
export function engagementRemainingMs(engagement: EngagementState, now = Date.now()): number {
  if (hasEngaged(engagement, now)) return 0;
  return Math.max(0, engagement.firstSeenAt + MIN_SESSION_MS - now);
}
