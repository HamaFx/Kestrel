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

// Platform / display-mode detection had no test file, yet it decides which
// install instructions a visitor sees (iOS "Add to Home Screen" vs Chromium
// prompt) and whether the app believes it is installed.
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  displayMode,
  isAndroid,
  isChromium,
  isDesktopSafari,
  isFirefox,
  isIOS,
  isIPad,
  isMacOS,
  isStandalone,
  isWindows,
  platform,
} from '@/lib/pwa/platform-detect';

const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1';
const IPADOS_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';
const MAC_SAFARI_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15';
const MAC_CHROME_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const ANDROID_UA =
  'Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';
const WINDOWS_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

function setUserAgent(userAgent: string): void {
  Object.defineProperty(window.navigator, 'userAgent', { value: userAgent, configurable: true });
}

function setTouchPoints(points: number): void {
  Object.defineProperty(window.navigator, 'maxTouchPoints', {
    value: points,
    configurable: true,
  });
}

/** Count the query strings the app asked matchMedia about. */
function stubDisplayMode(matchers: string[]): string[] {
  const seen: string[] = [];
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (query: string) => {
      seen.push(query);
      return {
        matches: matchers.includes(query),
        media: query,
        addEventListener() {},
        removeEventListener() {},
      };
    },
  });
  return seen;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('platform detection', () => {
  it('recognizes an iPhone', () => {
    setUserAgent(IPHONE_UA);
    expect(isIOS()).toBe(true);
    expect(isIPad()).toBe(false);
    expect(platform()).toBe('ios');
  });

  it('treats iPadOS 13+ (Macintosh UA with touch) as an iPad, not macOS', () => {
    setUserAgent(IPADOS_UA);
    setTouchPoints(5);

    expect(isIPad()).toBe(true);
    expect(isIOS()).toBe(true);
    expect(isMacOS()).toBe(false);
    expect(platform()).toBe('ipados');
  });

  it('keeps a real Mac a Mac, even though the browser defines ontouchend', () => {
    // Regression: `'ontouchend' in window` is true in Chrome/Safari/Firefox on
    // macOS, so the old check made every Mac an "iPad" and hid the desktop
    // Safari install flow.
    setUserAgent(MAC_SAFARI_UA);
    setTouchPoints(0);
    Object.defineProperty(window, 'ontouchend', { value: null, configurable: true });

    expect(isMacOS()).toBe(true);
    expect(isIOS()).toBe(false);
    expect(isIPad()).toBe(false);
    expect(isDesktopSafari()).toBe(true);
    expect(isChromium()).toBe(false);
    expect(platform()).toBe('macos');
  });

  it('excludes Chrome and Edge from the desktop-Safari path', () => {
    setUserAgent(MAC_CHROME_UA);
    setTouchPoints(0);

    expect(isDesktopSafari()).toBe(false);
    expect(isChromium()).toBe(true);
  });

  it('recognizes Android, Windows and Firefox', () => {
    setUserAgent(ANDROID_UA);
    expect(isAndroid()).toBe(true);
    expect(platform()).toBe('android');

    setUserAgent(WINDOWS_UA);
    expect(isWindows()).toBe(true);
    expect(isChromium()).toBe(true);
    expect(platform()).toBe('windows');

    setUserAgent('Mozilla/5.0 (X11; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0');
    expect(isFirefox()).toBe(true);
    expect(platform()).toBe('linux');
  });
});

describe('display mode', () => {
  it('prefers the most capable mode the browser reports', () => {
    const seen = stubDisplayMode(['(display-mode: standalone)', '(display-mode: fullscreen)']);

    expect(displayMode()).toBe('fullscreen');
    expect(seen[0]).toBe('(display-mode: window-controls-overlay)');
  });

  it('reports window-controls-overlay ahead of standalone', () => {
    stubDisplayMode(['(display-mode: window-controls-overlay)', '(display-mode: standalone)']);
    expect(displayMode()).toBe('window-controls-overlay');
  });

  it('defaults to browser when nothing matches', () => {
    stubDisplayMode([]);
    expect(displayMode()).toBe('browser');
  });
});

describe('standalone detection', () => {
  it('trusts the display-mode query', () => {
    stubDisplayMode(['(display-mode: standalone)']);
    expect(isStandalone()).toBe(true);
  });

  it('does not treat minimal-ui as installed', () => {
    stubDisplayMode(['(display-mode: minimal-ui)']);
    expect(isStandalone()).toBe(false);
  });

  it('trusts the iOS navigator.standalone marker', () => {
    stubDisplayMode([]);
    Object.defineProperty(window.navigator, 'standalone', { value: true, configurable: true });
    try {
      expect(isStandalone()).toBe(true);
    } finally {
      Reflect.deleteProperty(window.navigator as unknown as Record<string, unknown>, 'standalone');
    }
  });

  it('trusts an Android Trusted Web Activity referrer', () => {
    stubDisplayMode([]);
    Object.defineProperty(document, 'referrer', {
      value: 'android-app://com.kestrel.twa',
      configurable: true,
    });

    expect(isStandalone()).toBe(true);
  });
});
