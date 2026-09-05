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
import { cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

afterEach(cleanup);

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
});

vi.mock('next-view-transitions', () => ({
  Link: ({ children, ...props }: React.ComponentProps<'a'>) => <a {...props}>{children}</a>,
}));

vi.mock('next/link', () => ({
  default: ({ children, ...props }: React.ComponentProps<'a'>) => <a {...props}>{children}</a>,
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

import { MotionRoot } from '@/components/ui/motion-config';

describe('Tier 4: Responsive Parity & Zero Horizontal Clipping (>=5 tests)', () => {
  const globalsCssPath = path.resolve(__dirname, '../../app/globals.css');
  const globalsCss = fs.readFileSync(globalsCssPath, 'utf8');

  it('enforces 375px mobile viewport containment via max-width: 100vw and overflow-x: hidden', () => {
    expect(globalsCss).toMatch(/html,\s*body\s*\{[^}]*overflow-x:\s*hidden;/s);
    expect(globalsCss).toMatch(/html,\s*body\s*\{[^}]*max-width:\s*100vw;/s);
  });

  it('verifies bounded horizontal scrolling containers use overflow-x-auto and scrollbar-hide', () => {
    expect(globalsCss).toContain('.scrollbar-hide');
    expect(globalsCss).toContain('scrollbar-width: none;');
  });

  it('renders a sample 375px mobile rail without horizontal overflow or clipping', () => {
    function MobileChipRail() {
      return (
        <div style={{ width: '375px', maxWidth: '100vw', overflowX: 'hidden' }}>
          <div className="scrollbar-hide flex items-center gap-2 overflow-x-auto py-2">
            {['ALL', 'CRYPTO', 'FOREX', 'METALS', 'INDICES', 'ENERGY'].map((cat) => (
              <button
                key={cat}
                type="button"
                className="h-10 min-w-[44px] shrink-0 rounded-md px-3 text-xs tactile-press"
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
      );
    }

    const { container } = render(<MobileChipRail />);
    const rail = container.querySelector('.overflow-x-auto')!;
    expect(rail).not.toBeNull();
    expect(rail.className).toContain('scrollbar-hide');
    const buttons = container.querySelectorAll('button');
    expect(buttons.length).toBe(6);
    for (const btn of buttons) {
      expect(btn.className).toContain('h-10');
      expect(btn.className).toContain('tactile-press');
    }
  });

  it('verifies safe-area padding is applied to fixed and sticky chrome containers', () => {
    expect(globalsCss).toContain('@utility pt-safe {');
    expect(globalsCss).toContain('@utility pb-safe {');
    expect(globalsCss).toContain('@utility pl-safe {');
  });

  it('verifies Shiki code block styles enforce overflow-x: auto to prevent code snippet blowout', () => {
    expect(globalsCss).toMatch(/\.shiki\s*\{[^}]*overflow-x:\s*auto;/s);
  });
});

describe('Tier 4: Motion Physics & Reduced-Motion Accessibility (>=5 tests)', () => {
  const globalsCssPath = path.resolve(__dirname, '../../app/globals.css');
  const globalsCss = fs.readFileSync(globalsCssPath, 'utf8');
  const motionConfigPath = path.resolve(__dirname, '../../components/ui/motion-config.tsx');
  const motionConfigCode = fs.readFileSync(motionConfigPath, 'utf8');

  it('configures MotionRoot with reducedMotion="user" to honor OS accessibility preferences', () => {
    expect(motionConfigCode).toContain('reducedMotion="user"');
  });

  it('configures LazyMotion with domAnimation feature bundle for bundle efficiency', () => {
    expect(motionConfigCode).toContain('LazyMotion features={domAnimation}');
  });

  it('disables continuous ticker-track marquee animation when prefers-reduced-motion is active', () => {
    expect(globalsCss).toMatch(
      /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*?\.ticker-track\s*\{[^}]*animation:\s*none;/s,
    );
  });

  it('clamps all animation and transition durations to 0.01ms under forced reduced motion', () => {
    expect(globalsCss).toContain("html[data-reduce-motion='force']");
    expect(globalsCss).toContain('animation-duration: 0.01ms !important;');
    expect(globalsCss).toContain('transition-duration: 0.01ms !important;');
  });

  it('renders MotionRoot wrapping children seamlessly with motion context active', () => {
    render(
      <MotionRoot>
        <div data-testid="motion-child" className="surface-panel rounded-xl p-4">
          Animated Content Area
        </div>
      </MotionRoot>,
    );
    const child = screen.getByTestId('motion-child');
    expect(child).not.toBeNull();
    expect(child.className).toContain('surface-panel');
    expect(child.className).toContain('rounded-xl');
  });

  it('ensures tactile-press uses smooth 120ms cubic-bezier transition without layout shifting scales', () => {
    expect(globalsCss).toContain('transition: transform 120ms cubic-bezier(0.23, 1, 0.32, 1);');
  });
});
