// @vitest-environment jsdom
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

// Regression guard for the sidebar benchmark price:
//   - direction must come from mid vs. the previous mid — the old
//     `tick.bid >= tick.ask` check is never true for a live quote, so every
//     live tick rendered bearish;
//   - no tick yet must render the `---.--` placeholder, never a fake price.

import { cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SidebarTelemetry } from '@/components/layout/desktop-sidebar/sidebar-telemetry';

interface MockTick {
  symbol: string;
  mid: number;
  bid: number;
  ask: number;
}

let mockTick: MockTick | null = null;

vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
}));

vi.mock('@/hooks/use-prices', () => ({
  usePrice: () => ({ tick: mockTick, isLoading: false }),
}));

afterEach(() => {
  cleanup();
  mockTick = null;
});

function priceEl(): HTMLElement {
  return screen.getByTestId('sidebar-telemetry-price');
}

describe('SidebarTelemetry benchmark price', () => {
  it('shows the neutral placeholder (no fake price) before the first tick', () => {
    mockTick = null;
    render(<SidebarTelemetry collapsed={false} />);

    expect(priceEl().textContent).toBe('---.--');
    expect(priceEl().className).toContain('text-fg-subtle');
  });

  it('is bullish when mid rises, even though bid < ask', () => {
    mockTick = { symbol: 'XAUUSD', mid: 2734.5, bid: 2734.4, ask: 2734.6 };
    render(<SidebarTelemetry collapsed={false} />);

    expect(priceEl().textContent).toBe('$2734.50');
    expect(priceEl().className).toContain('text-bull');
    expect(priceEl().className).not.toContain('text-bear');
  });

  it('is bearish once mid ticks below the previous mid', () => {
    mockTick = { symbol: 'XAUUSD', mid: 2734.5, bid: 2734.4, ask: 2734.6 };
    const { rerender } = render(<SidebarTelemetry collapsed={false} />);
    expect(priceEl().className).toContain('text-bull');

    mockTick = { symbol: 'XAUUSD', mid: 2734.1, bid: 2734.0, ask: 2734.2 };
    rerender(<SidebarTelemetry collapsed={false} />);

    expect(priceEl().className).toContain('text-bear');
  });
});
