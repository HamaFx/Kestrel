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

// iOS shell contracts that are cheap to break and expensive to notice:
// they only show up on a physical iPhone, in the installed app.
//
// Guards two confirmed device bugs:
//   1. `apple-mobile-web-app-status-bar-style: black-translucent` let iOS
//      26.1+/27 draw its Liquid Glass bar over the app header (blurred top).
//   2. The mobile bottom nav used `h-14` + `pb-safe`, so the home indicator
//      inset ate into the bar and squeezed the icons into 22px.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const webRoot = process.cwd();
const read = (file: string) => readFileSync(resolve(webRoot, file), 'utf8');

describe('iOS shell contracts', () => {
  it('never requests a translucent status bar', () => {
    const layout = read('src/app/layout.tsx');
    // Ignore comments: the file documents *why* the translucent style is not
    // used, so only executable code may be checked.
    const code = layout.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    // Apple's Liquid Glass bar samples the page underneath; on the default
    // style iOS reserves the strip and tints it from theme-color instead.
    expect(code).not.toContain('black-translucent');
    expect(code).not.toContain('statusBarStyle');
    // The viewport must still extend under the cutouts for the insets to exist.
    expect(code).toContain("viewportFit: 'cover'");
  });

  it('extends the mobile bottom nav past the home indicator', () => {
    const nav = read('src/components/layout/mobile-bottom-nav.tsx');
    expect(nav).toContain('pb-safe');
    // Height must grow with the inset; a fixed height + padding squeezes the
    // nav icons instead of adding space.
    expect(nav).toContain('calc(3.5rem+env(safe-area-inset-bottom');
    expect(nav).toContain('px-safe');
  });

  it('keeps both top bars padded by the top inset', () => {
    for (const file of [
      'src/components/layout/top-bar.tsx',
      'src/components/chat/chat-top-bar/index.tsx',
    ]) {
      const source = read(file);
      expect(source, `${file} should pad the status-bar strip`).toContain('pt-safe');
      expect(source, `${file} should grow by the top inset`).toContain(
        'calc(3rem+env(safe-area-inset-top',
      );
    }
  });

  it('insets the shell for landscape cutouts and keeps the composer above the keyboard', () => {
    const shell = read('src/app/(app)/layout.tsx');
    expect(shell).toContain('px-safe');
    const layout = read('src/app/layout.tsx');
    expect(layout).toContain("interactiveWidget: 'resizes-content'");
  });

  it('guards iOS input zoom, tap highlight and text inflation in the base layer', () => {
    const css = read('src/app/globals.css');
    // < 16px fields make iOS zoom the viewport and leave it stuck there.
    expect(css).toContain('@supports (-webkit-touch-callout: none)');
    expect(css).toMatch(/font-size: 16px !important/);
    expect(css).toContain('-webkit-tap-highlight-color: transparent');
    expect(css).toContain('-webkit-text-size-adjust: 100%');
    expect(css).toContain('touch-action: manipulation');
  });
});
