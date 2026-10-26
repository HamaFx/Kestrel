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

// Install-nudge preference behaviour: the progressive snooze ladder, the legacy
// counter migration, and the engagement gate that keeps the prompt away from
// first-time visitors.

import { beforeEach, describe, expect, it } from 'vitest';

import {
  engagementRemainingMs,
  hasEngaged,
  isOfferable,
  markInstalled,
  PERMANENT_DISMISSAL_LIMIT,
  readEngagement,
  readInstallPreference,
  recordDismissal,
  registerEngagementOnce,
  snooze,
} from '@/lib/pwa/install-preference';

const DAY = 24 * 60 * 60 * 1000;
const STORAGE_KEY = 'kestrel:pwa-install';
const LEGACY_KEY = 'kestrel:install-dismissed';

beforeEach(() => {
  window.localStorage.clear();
});

describe('install preference', () => {
  it('offers the nudge on a fresh device', () => {
    const pref = readInstallPreference();
    expect(pref).toEqual({ dismissedCount: 0, snoozeUntil: null, installedAt: null });
    expect(isOfferable(pref)).toBe(true);
  });

  it('snoozes 3 days, then 14 days, then stops asking', () => {
    recordDismissal();
    const first = readInstallPreference();
    expect(first.dismissedCount).toBe(1);
    expect(first.snoozeUntil! - Date.now()).toBeGreaterThan(2.9 * DAY);
    expect(isOfferable(first)).toBe(false);

    recordDismissal();
    const second = readInstallPreference();
    expect(second.dismissedCount).toBe(2);
    expect(isOfferable(second)).toBe(false);
    // Once the second snooze lapses the nudge is allowed back.
    expect(isOfferable(second, Date.now() + 15 * DAY)).toBe(true);

    recordDismissal();
    const third = readInstallPreference();
    expect(third.dismissedCount).toBe(PERMANENT_DISMISSAL_LIMIT);
    expect(isOfferable(third, Date.now() + 365 * DAY)).toBe(false);
  });

  it('never offers the nudge once the app is installed', () => {
    markInstalled();
    const pref = readInstallPreference();
    expect(pref.installedAt).toBeTruthy();
    expect(isOfferable(pref)).toBe(false);
  });

  it('clears an active snooze on install', () => {
    recordDismissal();
    markInstalled();
    expect(readInstallPreference().snoozeUntil).toBeNull();
  });

  it('honours an explicit snooze window', () => {
    const until = Date.now() + 5 * DAY;
    snooze(until);
    expect(readInstallPreference().snoozeUntil).toBe(until);
  });

  it('migrates the legacy dismissal counter without restarting the ladder', () => {
    window.localStorage.setItem(LEGACY_KEY, '3');
    const pref = readInstallPreference();
    // Three dismissals in the legacy model meant "stop asking".
    expect(pref.dismissedCount).toBe(PERMANENT_DISMISSAL_LIMIT);
    expect(isOfferable(pref)).toBe(false);
    expect(window.localStorage.getItem(LEGACY_KEY)).toBeNull();
    // The migration is persisted so it only ever runs once.
    expect(window.localStorage.getItem(STORAGE_KEY)).not.toBeNull();
  });

  it('ignores a corrupt stored record', () => {
    window.localStorage.setItem(STORAGE_KEY, 'not json');
    expect(readInstallPreference()).toEqual({
      dismissedCount: 0,
      snoozeUntil: null,
      installedAt: null,
    });
  });
});

describe('engagement gate', () => {
  it('waits for a second visit or a minute of use', () => {
    const first = registerEngagementOnce();
    expect(first.sessions).toBe(1);
    expect(hasEngaged(first)).toBe(false);
    expect(engagementRemainingMs(first)).toBeGreaterThan(0);

    // A re-mount must not count as another visit.
    registerEngagementOnce();
    expect(readEngagement().sessions).toBe(1);

    // A minute of continuous use satisfies the gate.
    expect(hasEngaged(first, first.firstSeenAt + 61_000)).toBe(true);
    expect(engagementRemainingMs(first, first.firstSeenAt + 61_000)).toBe(0);
  });
});
