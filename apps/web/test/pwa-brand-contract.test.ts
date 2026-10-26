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

// PWA brand-colour contract.
//
// globals.css (@theme) is the rendering source of truth; pwa-theme.json feeds
// the manifest, the `theme-color` meta tag and the asset generators. They had
// already drifted once (#0A0A0A in the generated icons vs #121212 on screen),
// so this test re-derives every shared value from the CSS and fails on drift.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import manifest from '@/app/manifest';
import { PWA_BACKGROUND, PWA_PALETTE, PWA_THEME_COLOR } from '@/lib/pwa/pwa-theme';

const webRoot = process.cwd();
const css = readFileSync(resolve(webRoot, 'src/app/globals.css'), 'utf8');

/** Extract `--color-*: value;` declarations from a CSS block. */
function cssColorTokens(): Map<string, string> {
  const themeBlock = /@theme\s*\{([\s\S]*?)\n\}/.exec(css);
  expect(themeBlock, 'globals.css should declare an @theme block').toBeTruthy();
  const tokens = new Map<string, string>();
  for (const match of themeBlock![1].matchAll(/--color-([a-z0-9-]+):\s*([^;]+);/gi)) {
    tokens.set(match[1]!.toLowerCase(), match[2]!.trim());
  }
  return tokens;
}

function hexToRgb(hex: string): [number, number, number] {
  const value = hex.replace('#', '');
  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16),
  ];
}

/** Flatten an `rgba()`/hex token over the app background (what ends up on screen). */
function flatten(background: string, value: string): string {
  const bg = hexToRgb(background);
  const rgba = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)/i.exec(value);
  const [r, g, b, alpha] = rgba
    ? [
        Number(rgba[1]),
        Number(rgba[2]),
        Number(rgba[3]),
        rgba[4] === undefined ? 1 : Number(rgba[4]),
      ]
    : [...hexToRgb(value), 1];
  const mix = (channel: number, base: number) => Math.round(channel * alpha + base * (1 - alpha));
  return `#${[mix(r, bg[0]), mix(g, bg[1]), mix(b, bg[2])]
    .map((channel) => channel.toString(16).padStart(2, '0'))
    .join('')}`.toLowerCase();
}

describe('PWA brand contract', () => {
  const tokens = cssColorTokens();

  it('keeps pwa-theme.json in sync with the globals.css design tokens', () => {
    const background = tokens.get('bg');
    expect(background).toBe(PWA_BACKGROUND);

    const expectations: Record<string, string | undefined> = {
      fg: tokens.get('fg'),
      bgElev2: tokens.get('bg-elev-2'),
      bgElev3: tokens.get('bg-elev-3'),
      border: tokens.get('border'),
      brand: tokens.get('brand'),
      bull: tokens.get('bull'),
      bear: tokens.get('bear'),
      info: tokens.get('info'),
      warn: tokens.get('warn'),
    };

    for (const [token, cssValue] of Object.entries(expectations)) {
      expect(cssValue, `--color-${token} should be declared in globals.css`).toBeTruthy();
      expect(
        PWA_PALETTE[token as keyof typeof PWA_PALETTE],
        `pwa-theme.json ${token} should match globals.css`,
      ).toBe(String(cssValue).toLowerCase());
    }

    // Text tokens carry alpha in CSS; the JSON stores the flattened result.
    for (const token of ['fg-muted', 'fg-subtle'] as const) {
      const key = token === 'fg-muted' ? 'fgMuted' : 'fgSubtle';
      const cssValue = tokens.get(token);
      expect(cssValue, `--color-${token} should be declared in globals.css`).toBeTruthy();
      expect(PWA_PALETTE[key as keyof typeof PWA_PALETTE]).toBe(flatten(background!, cssValue!));
    }
  });

  it('drives the manifest and the theme-color meta tag from the same value', () => {
    const layout = readFileSync(resolve(webRoot, 'src/app/layout.tsx'), 'utf8');
    const doc = manifest();
    expect(doc.theme_color).toBe(PWA_THEME_COLOR);
    expect(doc.background_color).toBe(PWA_BACKGROUND);
    // No hardcoded chrome colour may survive in the layout.
    expect(layout).toContain('themeColor: PWA_THEME_COLOR');
  });

  it('keeps brand colours out of the asset generators (JSON or nothing)', () => {
    const generators = [
      'scripts/generate-icons.mjs',
      'scripts/generate-pwa-screenshots.mjs',
      'scripts/pwa-screens/kit.mjs',
      'scripts/pwa-screens/portrait.mjs',
      'scripts/pwa-screens/wide.mjs',
    ];
    for (const file of generators) {
      const source = readFileSync(resolve(webRoot, file), 'utf8');
      // Palette values must come from src/lib/pwa/pwa-theme.json only.
      expect(source, `${file} must not hardcode the app background`).not.toMatch(
        /#0a0a0a|#121212/i,
      );
      expect(source, `${file} must not hardcode the brand colour`).not.toMatch(/#ff3616/i);
    }
  });
});
