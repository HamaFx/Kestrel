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

// ---------------------------------------------------------------------------
// E2E: PWA installability + "Add to Home Screen"
//
// Covers the browser-facing contract the unit tests cannot: the manifest is
// actually served, the iOS/meta head tags land in the document, and the install
// nudge reacts to a real `beforeinstallprompt` event by opening the deferred
// prompt (and stops asking once the user accepts).
// ---------------------------------------------------------------------------

import { expect, test } from './fixtures';

/** Seed an engaged visitor so the nudge is not held back by the engagement gate. */
const ENGAGED_VISITOR = {
  sessions: 3,
  firstSeenAt: 0,
};

test.describe('PWA manifest', () => {
  test('is served as a web app manifest with the install contract', async ({ request }) => {
    const response = await request.get('/manifest.webmanifest');
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('manifest');

    const manifest = (await response.json()) as Record<string, unknown>;
    expect(manifest.id).toBe('/');
    expect(manifest.scope).toBe('/');
    expect(manifest.start_url).toBe('/chat');
    expect(manifest.display).toBe('standalone');
    expect(manifest.display_override).toContain('window-controls-overlay');
    expect(manifest.prefer_related_applications).toBe(false);

    const screenshots = manifest.screenshots as Array<{ form_factor?: string; src: string }>;
    expect(screenshots.filter((shot) => shot.form_factor === 'wide').length).toBeGreaterThan(0);
    expect(screenshots.filter((shot) => shot.form_factor === 'narrow').length).toBeGreaterThan(0);

    // Every icon and screenshot must be fetchable, or the install dialog breaks.
    const icons = manifest.icons as Array<{ src: string }>;
    for (const asset of [...icons, ...screenshots]) {
      const assetResponse = await request.get(asset.src);
      expect(assetResponse.status(), `${asset.src} should be served`).toBe(200);
    }
  });

  test('ships the iOS home-screen head tags', async ({ authedPage }) => {
    const page = authedPage;
    await page.goto('/dashboard');

    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
      'href',
      '/manifest.webmanifest',
    );
    // iOS home-screen web app behaviour + status bar + title under the icon.
    await expect(page.locator('meta[name="mobile-web-app-capable"]')).toHaveAttribute(
      'content',
      'yes',
    );
    await expect(page.locator('meta[name="apple-mobile-web-app-title"]')).toHaveAttribute(
      'content',
      'Kestrel',
    );
    // iOS 26.1+/27 draws its Liquid Glass bar over the top edge of standalone
    // web apps; `black-translucent` asked for exactly that and smeared the
    // header underneath it. The default style keeps the system bar opaque and
    // tinted from theme-color instead.
    await expect(
      page.locator('meta[name="apple-mobile-web-app-status-bar-style"]'),
    ).toHaveAttribute('content', 'default');
    // Landscape cutouts (px-safe) and the keyboard-aware chat composer (the
    // composer scrolls into view instead of hiding behind the keyboard).
    const viewportMeta = await page.locator('meta[name="viewport"]').getAttribute('content');
    expect(viewportMeta).toContain('viewport-fit=cover');
    expect(viewportMeta).toContain('interactive-widget=resizes-content');
    await expect(page.locator('link[rel="apple-touch-icon"]').first()).toBeAttached();
    // One launch image per device matrix entry (portrait + landscape).
    const splashes = page.locator('link[rel="apple-touch-startup-image"]');
    expect(await splashes.count()).toBeGreaterThan(20);
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#121212');
  });
});

test.describe('Install nudge (beforeinstallprompt)', () => {
  test('offers the native install prompt and stops asking after accepting', async ({
    authedPage,
  }) => {
    const page = authedPage;

    await page.addInitScript((engagement) => {
      window.localStorage.setItem('kestrel:pwa-engagement', JSON.stringify(engagement));
      window.localStorage.removeItem('kestrel:pwa-install');
      // Chromium fires this event; we synthesize the parts the nudge uses.
      const promptEvent = new Event('beforeinstallprompt');
      Object.assign(promptEvent, {
        prompt: () => {
          (window as unknown as { __installPromptOpened?: boolean }).__installPromptOpened = true;
          return Promise.resolve();
        },
        userChoice: Promise.resolve({ outcome: 'accepted' }),
      });
      window.dispatchEvent(promptEvent);
    }, ENGAGED_VISITOR);

    await page.goto('/dashboard');

    const card = page.getByRole('region', { name: 'Install Kestrel' });
    await expect(card).toBeVisible({ timeout: 15_000 });
    await expect(card.getByText('Install Kestrel')).toBeVisible();

    await card.getByRole('button', { name: 'Install' }).click();

    await expect
      .poll(() =>
        page.evaluate(
          () => (window as unknown as { __installPromptOpened?: boolean }).__installPromptOpened,
        ),
      )
      .toBe(true);
    // Accepted installs are recorded, so the nudge retires itself.
    await expect(card).toHaveCount(0);
  });

  test('snoozes instead of nagging when the user chooses “Not now”', async ({ authedPage }) => {
    const page = authedPage;

    await page.addInitScript((engagement) => {
      window.localStorage.setItem('kestrel:pwa-engagement', JSON.stringify(engagement));
      window.localStorage.removeItem('kestrel:pwa-install');
      const promptEvent = new Event('beforeinstallprompt');
      Object.assign(promptEvent, {
        prompt: () => Promise.resolve(),
        userChoice: Promise.resolve({ outcome: 'dismissed' }),
      });
      window.dispatchEvent(promptEvent);
    }, ENGAGED_VISITOR);

    await page.goto('/dashboard');

    const card = page.getByRole('region', { name: 'Install Kestrel' });
    await expect(card).toBeVisible({ timeout: 15_000 });
    await card.getByRole('button', { name: 'Not now' }).click();
    await expect(card).toHaveCount(0);

    const pref = await page.evaluate(() =>
      JSON.parse(window.localStorage.getItem('kestrel:pwa-install') ?? '{}'),
    );
    expect(pref.dismissedCount).toBe(1);
    expect(pref.snoozeUntil).toBeGreaterThan(Date.now());

    // A reload inside the snooze window must stay quiet.
    await page.reload();
    await page.waitForTimeout(1500);
    await expect(page.getByRole('region', { name: 'Install Kestrel' })).toHaveCount(0);
  });

  test('does not interrupt the chat composer', async ({ authedPage }) => {
    const page = authedPage;
    await page.addInitScript((engagement) => {
      window.localStorage.setItem('kestrel:pwa-engagement', JSON.stringify(engagement));
      const promptEvent = new Event('beforeinstallprompt');
      Object.assign(promptEvent, {
        prompt: () => Promise.resolve(),
        userChoice: Promise.resolve({ outcome: 'dismissed' }),
      });
      window.dispatchEvent(promptEvent);
    }, ENGAGED_VISITOR);

    await page.goto('/chat');
    await page.waitForTimeout(1500);
    await expect(page.getByRole('region', { name: 'Install Kestrel' })).toHaveCount(0);
  });
});

test.describe('Share target', () => {
  // The receiver is public (it lives under the `/share` prefix that the auth
  // matcher skips) and does all of its work in the query string, so these tests
  // never enter the chat surface: the redirect itself is the contract.
  test('redirects a shared link into a research thread prompt', async ({ request }) => {
    const response = await request.get(
      '/share/receive?title=Gold%20spikes%20on%20CPI&text=Print%20came%20in%20hot&url=https%3A%2F%2Fexample.com%2Fgold',
      { maxRedirects: 0 },
    );

    expect(response.status()).toBeGreaterThanOrEqual(300);
    expect(response.status()).toBeLessThan(400);
    const location = response.headers()['location'] ?? '';
    expect(location.startsWith('/chat?')).toBe(true);

    const prompt = new URL(location, 'https://kestrel.test').searchParams.get('prompt') ?? '';
    expect(prompt).toContain('Title: Gold spikes on CPI');
    expect(prompt).toContain('Shared: Print came in hot');
    expect(prompt).toContain('https://example.com/gold');
    // A fresh thread: the share must not land in whatever was open last.
    expect(location).toContain('new=1');
  });

  test('refuses to carry a non-http(s) URL into the prompt', async ({ request }) => {
    const response = await request.get('/share/receive?url=javascript%3Aalert(1)', {
      maxRedirects: 0,
    });

    // Nothing usable left → the receiver renders the empty state instead of
    // redirecting with an executable scheme in the prompt.
    expect(response.status()).toBe(200);
    expect(await response.text()).toContain('Nothing to analyse');
  });

  test('keeps the receiver out of search results', async ({ page }) => {
    await page.goto('/share/receive');

    await expect(page.getByRole('heading', { name: /nothing to analyse/i })).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  });
});
