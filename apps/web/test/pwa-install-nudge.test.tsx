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

// <InstallNudge> behaviour: which card the platform gets, what the Install
// button does with the deferred prompt, and when the nudge must stay silent.

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// `install-preference.ts` keeps a module-level "already counted this visit"
// cache, so each test loads a fresh module graph before rendering.
async function renderNudge() {
  vi.resetModules();
  const { InstallNudge } = await import('@/components/layout/install-nudge');
  return render(<InstallNudge />);
}

const nav = vi.hoisted(() => ({ pathname: '/dashboard' }));
vi.mock('next/navigation', () => ({ usePathname: () => nav.pathname }));

const INSTALL_KEY = 'kestrel:pwa-install';
const ENGAGEMENT_KEY = 'kestrel:pwa-engagement';
const CHROME_ANDROID = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/131.0.0.0 Mobile';
const IOS_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1';

function setUserAgent(userAgent: string): void {
  Object.defineProperty(window.navigator, 'userAgent', { value: userAgent, configurable: true });
}

/** Chromium-style deferred prompt, delivered after the hook has subscribed. */
function dispatchInstallPrompt(outcome: 'accepted' | 'dismissed') {
  const prompt = vi.fn(() => Promise.resolve());
  const event = new Event('beforeinstallprompt');
  Object.assign(event, { prompt, userChoice: Promise.resolve({ outcome }) });
  act(() => {
    window.dispatchEvent(event);
  });
  return prompt;
}

function seedEngagedVisitor(): void {
  window.localStorage.setItem(ENGAGEMENT_KEY, JSON.stringify({ sessions: 3, firstSeenAt: 0 }));
}

beforeEach(() => {
  window.localStorage.clear();
  nav.pathname = '/dashboard';
  setUserAgent(CHROME_ANDROID);
});

afterEach(cleanup);

describe('<InstallNudge>', () => {
  it('stays quiet for a first-time visitor even when the browser offers a prompt', async () => {
    // Fresh device: the engagement gate must hold the nudge back.
    await renderNudge();
    dispatchInstallPrompt('accepted');

    await waitFor(() => {
      expect(screen.queryByRole('region', { name: 'Install Kestrel' })).toBeNull();
    });
    // The visit is still counted, so a second visit can be offered the nudge.
    expect(JSON.parse(window.localStorage.getItem(ENGAGEMENT_KEY) ?? '{}')).toMatchObject({
      sessions: 1,
    });
  });

  it('shows the install button for an engaged visitor and opens the deferred prompt', async () => {
    seedEngagedVisitor();

    await renderNudge();
    const prompt = dispatchInstallPrompt('accepted');

    const installButton = await screen.findByRole('button', { name: /^install$/i });
    fireEvent.click(installButton);

    await waitFor(() => {
      expect(prompt).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole('region', { name: 'Install Kestrel' })).toBeNull();
    });
    // Accepting records the install so the nudge retires itself.
    const stored = JSON.parse(window.localStorage.getItem(INSTALL_KEY) ?? '{}') as {
      installedAt?: number;
    };
    expect(stored.installedAt).toBeGreaterThan(0);
  });

  it('snoozes instead of retiring when the user declines the browser dialog', async () => {
    seedEngagedVisitor();

    await renderNudge();
    dispatchInstallPrompt('dismissed');

    fireEvent.click(await screen.findByRole('button', { name: /^install$/i }));

    await waitFor(() => {
      const stored = JSON.parse(window.localStorage.getItem(INSTALL_KEY) ?? '{}') as {
        dismissedCount?: number;
        snoozeUntil?: number;
        installedAt?: number | null;
      };
      expect(stored.dismissedCount).toBe(1);
      expect(stored.snoozeUntil).toBeGreaterThan(Date.now());
      expect(stored.installedAt).toBeNull();
    });
  });

  it('snoozes when the user chooses “Not now”', async () => {
    seedEngagedVisitor();

    await renderNudge();
    dispatchInstallPrompt('accepted');

    fireEvent.click(await screen.findByRole('button', { name: /not now/i }));

    const stored = JSON.parse(window.localStorage.getItem(INSTALL_KEY) ?? '{}') as {
      dismissedCount?: number;
    };
    expect(stored.dismissedCount).toBe(1);
    expect(screen.queryByRole('region', { name: 'Install Kestrel' })).toBeNull();
  });

  it('gives iOS the Add to Home Screen steps instead of a dead button', async () => {
    setUserAgent(IOS_SAFARI);
    seedEngagedVisitor();

    await renderNudge();

    expect(await screen.findByText(/add kestrel to your home screen/i)).toBeTruthy();
    expect(screen.getByText(/tap share/i)).toBeTruthy();
    // No native prompt exists on iOS — never render a button that cannot work.
    expect(screen.queryByRole('button', { name: /^install$/i })).toBeNull();
  });

  it('respects a permanent dismissal', async () => {
    window.localStorage.setItem(ENGAGEMENT_KEY, JSON.stringify({ sessions: 5, firstSeenAt: 0 }));
    window.localStorage.setItem(
      INSTALL_KEY,
      JSON.stringify({ dismissedCount: 3, snoozeUntil: null, installedAt: null }),
    );

    await renderNudge();
    dispatchInstallPrompt('accepted');

    await waitFor(() => {
      expect(screen.queryByRole('region', { name: 'Install Kestrel' })).toBeNull();
    });
  });

  it('never covers the chat composer', async () => {
    nav.pathname = '/chat';
    seedEngagedVisitor();

    await renderNudge();
    dispatchInstallPrompt('accepted');

    await waitFor(() => {
      expect(screen.queryByRole('region', { name: 'Install Kestrel' })).toBeNull();
    });
  });

  it('stays out of the way on the install settings page', async () => {
    nav.pathname = '/settings/install';
    seedEngagedVisitor();

    await renderNudge();
    dispatchInstallPrompt('accepted');

    await waitFor(() => {
      expect(screen.queryByRole('region', { name: 'Install Kestrel' })).toBeNull();
    });
  });
});
