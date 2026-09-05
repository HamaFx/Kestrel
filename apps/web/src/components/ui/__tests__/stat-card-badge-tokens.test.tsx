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

import { cleanup, render } from '@testing-library/react';
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

import { Badge } from '../badge';
import { StatCard } from '../stat-card';
import { Toaster } from '../toaster';

describe('Tier 1: StatCard Cyber-Industrial Tokens (>=5 tests)', () => {
  it('standardizes StatCard corner radius to rounded-xl', () => {
    const { container } = render(<StatCard label="Win Rate" value="68.4%" />);
    const card = container.firstElementChild!;
    expect(card.className).toContain('rounded-xl');
    expect(card.className).not.toContain('rounded-sm');
  });

  it('applies surface-chip styling with bg-elev-1 and border-border', () => {
    const { container } = render(<StatCard label="Sharpe" value="2.14" />);
    const card = container.firstElementChild!;
    expect(card.className).toContain('surface-chip');
    expect(card.className).toContain('bg-bg-elev-1');
    expect(card.className).toContain('border-border');
  });

  it.each([
    ['bull', 'border-l-bull/40'],
    ['bear', 'border-l-bear/40'],
    ['warn', 'border-l-warn/40'],
  ] as const)('applies tone accent border tint "%s" -> "%s"', (tone, expectedClass) => {
    const { container } = render(<StatCard label="P&L" value="+$1,450" tone={tone} />);
    const card = container.firstElementChild!;
    expect(card.className).toContain(expectedClass);
  });

  it('renders numeric values with tabular-nums and font-mono', () => {
    const { container } = render(<StatCard label="Total Trades" value="124" />);
    const valueEl = container.querySelector('.font-mono.tabular-nums');
    expect(valueEl).not.toBeNull();
    expect(valueEl?.textContent).toBe('124');
  });

  it('renders sparkline svg when data points >= 2 are supplied', () => {
    const { container } = render(
      <StatCard label="Equity" value="$12,450" sparkline={[100, 105, 102, 110]} />,
    );
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute('role')).toBe('img');
  });

  it('renders clean placeholder spacer when sparkline points < 2', () => {
    const { container } = render(<StatCard label="Volume" value="45.2K" sparkline={[100]} />);
    const svg = container.querySelector('svg');
    expect(svg).toBeNull();
    const spacer = container.querySelector('.h-6');
    expect(spacer).not.toBeNull();
  });
});

describe('Tier 1 & Tier 2: Badge Geometric Precision & Tones (>=5 tests)', () => {
  it('standardizes Badge geometry to rounded-md engineered chamfer', () => {
    const { container } = render(<Badge>ACTIVE</Badge>);
    const badge = container.firstElementChild!;
    expect(badge.className).toContain('rounded-md');
    expect(badge.className).not.toContain('rounded-full');
    expect(badge.className).not.toContain('rounded-sm');
  });

  it('applies micro-typography tokens font-mono text-[11px] font-bold uppercase tracking-wider', () => {
    const { container } = render(<Badge>LIVE</Badge>);
    const badge = container.firstElementChild!;
    expect(badge.className).toContain('font-mono');
    expect(badge.className).toContain('text-[11px]');
    expect(badge.className).toContain('font-bold');
    expect(badge.className).toContain('uppercase');
    expect(badge.className).toContain('tracking-wider');
  });

  it.each([
    ['success', 'bg-success/10', 'text-success'],
    ['danger', 'bg-danger/10', 'text-danger'],
    ['warn', 'bg-warn/10', 'text-warn'],
    ['brand', 'bg-brand/10', 'text-brand'],
    ['neutral', 'bg-bg-elev-2', 'text-fg-muted'],
  ] as const)('applies tone classes for badge tone "%s"', (tone, bgClass, textClass) => {
    const { container } = render(<Badge tone={tone}>STATUS</Badge>);
    const badge = container.firstElementChild!;
    expect(badge.className).toContain(bgClass);
    expect(badge.className).toContain(textClass);
  });

  it('merges custom className without clobbering base badge tokens', () => {
    const { container } = render(<Badge className="shadow-sm ring-1 ring-white/10">BADGE</Badge>);
    const badge = container.firstElementChild!;
    expect(badge.className).toContain('shadow-sm');
    expect(badge.className).toContain('ring-1');
    expect(badge.className).toContain('rounded-md');
  });

  it('renders as an accessible span with inline-flex display', () => {
    const { container } = render(<Badge>TAG</Badge>);
    const badge = container.firstElementChild!;
    expect(badge.tagName).toBe('SPAN');
    expect(badge.className).toContain('inline-flex');
  });
});

describe('Tier 1 & Tier 2: Toaster Design Tokens', () => {
  it('renders Toaster with accessible live region for screen-reader notifications', () => {
    const { container } = render(<Toaster />);
    const liveRegion = container.querySelector('div.sr-only[aria-live="polite"]');
    expect(liveRegion).not.toBeNull();
    expect(liveRegion?.getAttribute('aria-atomic')).toBe('true');
    expect(liveRegion?.className).toContain('sr-only');
  });
});
