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
// E2E: Theme tokens
//
// Verifies that the Hoplite Dark CSS design tokens declared in
// apps/web/src/app/globals.css render correctly on :root. A single navigation
// reads every semantic token in one evaluate pass (values are asserted against
// globals.css — keep them in sync when the theme changes).
// ---------------------------------------------------------------------------

import { expect, test } from './fixtures';

test.describe('Theme tokens — Hoplite Dark root custom properties', () => {
  test('root CSS custom properties match the globals.css design tokens', async ({ authedPage }) => {
    const page = authedPage;
    await page.goto('/chat');

    const tokens = await page.evaluate(() => {
      const rootStyles = getComputedStyle(document.documentElement);
      const read = (name: string) => rootStyles.getPropertyValue(name).trim().toLowerCase();
      return {
        bear: read('--color-bear'),
        bull: read('--color-bull'),
        brand: read('--color-brand'),
        bg: read('--color-bg'),
        surface: read('--color-bg-elev-1'),
        border: read('--color-border'),
        fg: read('--color-fg'),
        fgMuted: read('--color-fg-muted'),
        radiusSm: read('--radius-sm'),
        bodyBg: getComputedStyle(document.body).backgroundColor,
      };
    });

    expect(tokens).toEqual({
      bear: '#e02c10',
      bull: '#3f9e3d',
      brand: '#ff3616',
      bg: '#121212',
      surface: '#1a1a1a',
      border: '#2c2c2c',
      fg: '#f0f0f0',
      fgMuted: '#8e8e8e',
      radiusSm: '4px',
      // rgb(18, 18, 18) = #121212 (--color-bg)
      bodyBg: 'rgb(18, 18, 18)',
    });
  });
});
