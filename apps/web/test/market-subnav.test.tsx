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

// Phase 3 Task 1 — the Market pillar in the sidebar (`/news`) now spans three
// routes. These contracts keep the shared sub-nav wired to all of them and
// keep the active-state logic (including nested `/chart/[symbol]` paths)
// pointing at exactly one tab.

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MarketSubNav } from '@/components/layout/market-subnav';

let mockPathname = '/news';

vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
}));

beforeEach(() => {
  mockPathname = '/news';
});

afterEach(cleanup);

describe('MarketSubNav (Phase 3)', () => {
  it('links to the news wire, economic calendar, and live chart routes', () => {
    render(<MarketSubNav />);

    expect(screen.getByRole('link', { name: /news wire/i })).toHaveAttribute('href', '/news');
    expect(screen.getByRole('link', { name: /economic calendar/i })).toHaveAttribute(
      'href',
      '/calendar',
    );
    expect(screen.getByRole('link', { name: /live chart/i })).toHaveAttribute(
      'href',
      '/chart/XAUUSD',
    );
  });

  it('marks exactly the active market route with aria-current', () => {
    mockPathname = '/calendar';
    render(<MarketSubNav />);

    const current = screen.getAllByRole('link').filter((el) => el.getAttribute('aria-current'));
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveAttribute('href', '/calendar');
    expect(current[0]?.className).toContain('text-brand');
  });

  it('keeps the chart tab active on nested chart symbols', () => {
    mockPathname = '/chart/EURUSD';
    render(<MarketSubNav />);

    expect(screen.getByRole('link', { name: /live chart/i })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });
});
