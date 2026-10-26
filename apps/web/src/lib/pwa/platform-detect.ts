// SPDX-License-Identifier: Apache-2.0
//
// Platform + display-mode detection for the install / home-screen surface.
//
// Every helper is SSR-safe: they return `false` (or 'browser') when there is no
// `window`, so they can be called from a render path and only committed inside
// an effect. Detection is best-effort — never a security boundary.

export type Platform = 'ios' | 'ipados' | 'android' | 'macos' | 'windows' | 'linux' | 'other';

export type DisplayMode =
  'browser' | 'standalone' | 'minimal-ui' | 'fullscreen' | 'window-controls-overlay';

function ua(): string {
  return typeof navigator === 'undefined' ? '' : navigator.userAgent;
}

function hasWindow(): boolean {
  return typeof window !== 'undefined';
}

function isTouchCapable(): boolean {
  if (!hasWindow()) return false;
  return (
    'ontouchend' in window || (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0)
  );
}

/** iPhone/iPod, or iPadOS 13+ which reports itself as "Macintosh" + touch. */
export function isIOS(): boolean {
  const agent = ua();
  if (/iPhone|iPod/.test(agent)) return true;
  return /iPad/.test(agent) || (/Macintosh/.test(agent) && isTouchCapable());
}

export function isIPad(): boolean {
  const agent = ua();
  return /iPad/.test(agent) || (/Macintosh/.test(agent) && isTouchCapable());
}

export function isAndroid(): boolean {
  return /Android/.test(ua());
}

export function isMacOS(): boolean {
  const agent = ua();
  return /Macintosh/.test(agent) && !isIOS();
}

export function isWindows(): boolean {
  return /Windows/.test(ua());
}

/**
 * Desktop Safari. Every iOS browser is WebKit, so this intentionally excludes
 * iOS: only macOS Safari offers "Add to Dock".
 */
export function isDesktopSafari(): boolean {
  const agent = ua();
  return isMacOS() && /Safari/.test(agent) && !/Chrome|Chromium|Edg\//.test(agent);
}

/** Chromium family (Chrome, Edge, Brave, Opera, Arc). */
export function isChromium(): boolean {
  return /Chrome|Chromium|CriOS|Edg\//.test(ua());
}

export function isFirefox(): boolean {
  return /Firefox|FxiOS/.test(ua());
}

export function platform(): Platform {
  if (!hasWindow()) return 'other';
  if (isIPad()) return 'ipados';
  if (isIOS()) return 'ios';
  if (isAndroid()) return 'android';
  if (isMacOS()) return 'macos';
  if (isWindows()) return 'windows';
  if (/Linux/.test(ua())) return 'linux';
  return 'other';
}

/** Current display mode as reported by the browser. */
export function displayMode(): DisplayMode {
  if (!hasWindow() || typeof window.matchMedia !== 'function') return 'browser';
  for (const mode of [
    'window-controls-overlay',
    'fullscreen',
    'standalone',
    'minimal-ui',
  ] as const) {
    if (window.matchMedia(`(display-mode: ${mode})`).matches) return mode;
  }
  return 'browser';
}

/**
 * True when the app is running as an installed app: Chromium display modes,
 * the iOS `navigator.standalone` marker, or an Android TWA/origin match.
 */
export function isStandalone(): boolean {
  if (!hasWindow()) return false;
  const mode = displayMode();
  if (mode !== 'browser' && mode !== 'minimal-ui') return true;
  // iOS home-screen web apps predate the display-mode media query.
  if (
    typeof navigator !== 'undefined' &&
    (navigator as { standalone?: boolean }).standalone === true
  ) {
    return true;
  }
  // Android Trusted Web Activity.
  if (typeof document !== 'undefined' && document.referrer.startsWith('android-app://')) {
    return true;
  }
  return false;
}
