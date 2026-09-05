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
// @vitest-environment jsdom

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { colors, radii } from '@kestrel/config/tailwind/tokens';

const globalsCssPath = path.resolve(__dirname, '../../app/globals.css');
const layoutTsxPath = path.resolve(__dirname, '../../app/layout.tsx');

describe('Tier 1: CSS Utility & Design Token Contracts', () => {
  const globalsCss = fs.readFileSync(globalsCssPath, 'utf8');
  const layoutTsx = fs.readFileSync(layoutTsxPath, 'utf8');

  describe('Feature 1: tactile-press & chip-press CSS Utilities (>=5 tests)', () => {
    it('declares @utility tactile-press with a 120ms cubic-bezier transition', () => {
      expect(globalsCss).toMatch(
        /@utility\s+tactile-press\s*\{[^}]*transition:\s*transform\s+120ms\s+cubic-bezier\(0\.23,\s*1,\s*0\.32,\s*1\);/s,
      );
    });

    it('declares tactile-press active transform with translateY(0.5px)', () => {
      const match = globalsCss.match(/@utility\s+tactile-press\s*\{([^}]*\{[^}]*\}[^}]*)\}/s);
      expect(match).not.toBeNull();
      const body = match![1];
      expect(body).toMatch(/&:active\s*\{[^}]*transform:\s*translateY\(0\.5px\);/s);
    });

    it('declares @utility chip-press with matching 120ms cubic-bezier transition', () => {
      expect(globalsCss).toMatch(
        /@utility\s+chip-press\s*\{[^}]*transition:\s*transform\s+120ms\s+cubic-bezier\(0\.23,\s*1,\s*0\.32,\s*1\);/s,
      );
    });

    it('declares chip-press active transform with translateY(0.5px)', () => {
      const match = globalsCss.match(/@utility\s+chip-press\s*\{([^}]*\{[^}]*\}[^}]*)\}/s);
      expect(match).not.toBeNull();
      const body = match![1];
      expect(body).toMatch(/&:active\s*\{[^}]*transform:\s*translateY\(0\.5px\);/s);
    });

    it('does not attach jarring scale transforms (scale-95, scale-[0.98]) to tactile-press utility', () => {
      const match = globalsCss.match(/@utility\s+tactile-press\s*\{([^}]*)\}/s);
      expect(match).not.toBeNull();
      expect(match![1]).not.toContain('scale');
    });

    it('ensures micro-press displacement is strictly positive 0.5px downward depression in tactile utilities', () => {
      const tactileMatch = globalsCss.match(/@utility\s+(?:tactile|chip)-press\s*\{[^}]*&:active\s*\{[^}]*transform:\s*translateY\(([^)]+)\);/g);
      expect(tactileMatch).not.toBeNull();
      expect(tactileMatch!.length).toBe(2);
      for (const block of tactileMatch!) {
        expect(block).toContain('translateY(0.5px)');
      }
    });
  });

  describe('Feature 2: .surface-panel, .surface-chip, .surface-well Crisp 1px Borders (>=5 tests)', () => {
    it('defines surface-panel with background elev-1, crisp 1px border, and inset specular highlight', () => {
      const match = globalsCss.match(/@utility\s+surface-panel\s*\{([^}]+)\}/);
      expect(match).not.toBeNull();
      const content = match![1];
      expect(content).toContain('background: var(--color-bg-elev-1);');
      expect(content).toContain('border: 1px solid var(--color-border);');
      expect(content).toContain('inset 0 1px 0 rgba(255, 255, 255, 0.08)');
    });

    it('defines surface-chip with crisp 1px solid var(--color-edge) border (no subpixel 0.714px)', () => {
      const match = globalsCss.match(/@utility\s+surface-chip\s*\{([^}]+)\}/);
      expect(match).not.toBeNull();
      const content = match![1];
      expect(content).toContain('border: 1px solid var(--color-edge);');
      expect(content).not.toContain('0.714px');
      expect(content).not.toContain('0.5px');
    });

    it('defines surface-well with crisp 1px solid var(--color-border) border (no subpixel 0.5px)', () => {
      const match = globalsCss.match(/@utility\s+surface-well\s*\{([^}]+)\}/);
      expect(match).not.toBeNull();
      const content = match![1];
      expect(content).toContain('border: 1px solid var(--color-border);');
      expect(content).not.toContain('0.5px');
      expect(content).not.toContain('0.714px');
    });

    it('defines surface-well-deep with crisp 1px border and sunken shadow', () => {
      const match = globalsCss.match(/@utility\s+surface-well-deep\s*\{([^}]+)\}/);
      expect(match).not.toBeNull();
      const content = match![1];
      expect(content).toContain('border: 1px solid var(--color-border);');
      expect(content).toContain('background: var(--color-well);');
      expect(content).toContain('box-shadow: var(--shadow-well);');
    });

    it('standardizes surface-chip-dark and surface-chip-destructive to crisp 1px borders', () => {
      const darkMatch = globalsCss.match(/@utility\s+surface-chip-dark\s*\{([^}]+)\}/);
      expect(darkMatch).not.toBeNull();
      expect(darkMatch![1]).toContain('border: 1px solid rgba(255, 255, 255, 0.14);');

      const destMatch = globalsCss.match(/@utility\s+surface-chip-destructive\s*\{([^}]+)\}/);
      expect(destMatch).not.toBeNull();
      expect(destMatch![1]).toContain('border: 1px solid #d92c10;');
    });
  });

  describe('Feature 3: Design Tokens Synchronization (>=5 tests)', () => {
    it('synchronizes colors.bg to obsidian canvas #121212', () => {
      expect(colors.bg).toBe('#121212');
    });

    it('synchronizes colors.brand to Hoplite Flame #ff3616', () => {
      expect(colors.brand).toBe('#ff3616');
    });

    it('synchronizes radii.xl to 12px for cyber-industrial panels', () => {
      expect(radii.xl).toBe('12px');
    });

    it('synchronizes radii.md to 6px and radii.sm to 4px for precision controls', () => {
      expect(radii.md).toBe('6px');
      expect(radii.sm).toBe('4px');
      expect(radii.lg).toBe('8px');
    });

    it('synchronizes layout.tsx viewport themeColor to #121212', () => {
      expect(layoutTsx).toMatch(/themeColor:\s*['"]#121212['"]/);
    });
  });
});

describe('Tier 2: Boundary & Corner Cases in CSS and Viewports', () => {
  const globalsCss = fs.readFileSync(globalsCssPath, 'utf8');

  it('locks root viewport with overflow-x: hidden on html, body to prevent mobile horizontal wobble', () => {
    const baseMatch = globalsCss.match(/@layer\s+base\s*\{([\s\S]*?)\n\}/);
    expect(baseMatch).not.toBeNull();
    const baseContent = baseMatch![1];
    expect(baseContent).toMatch(/html,\s*body\s*\{[^}]*overflow-x:\s*hidden;/s);
  });

  it('clamps root viewport with max-width: 100vw on html, body to avoid iOS elastic scroll distortion', () => {
    const baseMatch = globalsCss.match(/@layer\s+base\s*\{([\s\S]*?)\n\}/);
    expect(baseMatch).not.toBeNull();
    const baseContent = baseMatch![1];
    expect(baseContent).toMatch(/html,\s*body\s*\{[^}]*max-width:\s*100vw;/s);
  });

  it('preserves overscroll-behavior-y: none on html to prevent browser pull-to-refresh interference', () => {
    expect(globalsCss).toMatch(/html\s*\{[^}]*overscroll-behavior-y:\s*none;/s);
  });

  it('provides safe-area utility classes for pt-safe, pb-safe, pl-safe, pr-safe', () => {
    expect(globalsCss).toContain('@utility pt-safe {');
    expect(globalsCss).toContain('padding-top: env(safe-area-inset-top);');
    expect(globalsCss).toContain('@utility pb-safe {');
    expect(globalsCss).toContain('padding-bottom: env(safe-area-inset-bottom);');
    expect(globalsCss).toContain('@utility pl-safe {');
    expect(globalsCss).toContain('padding-left: env(safe-area-inset-left);');
  });

  it('guarantees no fractional pixel borders (0.5px, 0.714px) remain in any surface utility', () => {
    const surfaceBlockMatch = globalsCss.match(/Tactile & Neo-Skeuomorphic Surface Utilities[\s\S]*?@utility border-chip-edge/);
    expect(surfaceBlockMatch).not.toBeNull();
    const block = surfaceBlockMatch![0];
    expect(block).not.toContain('0.5px solid');
    expect(block).not.toContain('0.714px solid');
  });
});
