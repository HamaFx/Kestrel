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

// The phone bottom bar is the primary navigation surface for an installed app.
// Its "current tab" contract matters: the four tabs are Research/Overview/
// Journal/Alerts, and every other destination (Market, Chart, Settings, a
// plugin) is reached through "More", which must light up instead of leaving the
// bar with nothing marked.
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { MobileBottomNav } from '@/components/layout/mobile-bottom-nav';

let pathname = '/dashboard';

vi.mock('next/navigation', () => ({
  usePathname: () => pathname,
}));

afterEach(() => {
  cleanup();
  pathname = '/dashboard';
});

describe('mobile bottom nav', () => {
  it('marks the tab matching the current route as current', () => {
    pathname = '/dashboard';
    render(<MobileBottomNav />);

    expect(screen.getByRole('link', { name: 'Overview' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: /open navigation menu/i })).not.toHaveAttribute(
      'aria-current',
    );
  });

  it('treats a nested route as its tab', () => {
    pathname = '/journal/trade-42';
    render(<MobileBottomNav />);

    expect(screen.getByRole('link', { name: 'Journal' })).toHaveAttribute('aria-current', 'page');
  });

  it.each(['/news', '/calendar', '/chart/XAUUSD', '/settings/install'])(
    'lights up "More" on the secondary route %s',
    (route) => {
      pathname = route;
      render(<MobileBottomNav />);

      const more = screen.getByRole('button', { name: /open navigation menu/i });
      expect(more).toHaveAttribute('aria-current', 'true');
      expect(more).toHaveClass('text-brand');
      for (const label of ['Research', 'Overview', 'Journal', 'Alerts']) {
        expect(screen.getByRole('link', { name: label })).not.toHaveAttribute('aria-current');
      }
    },
  );

  it('renders nothing on the chat surface', () => {
    pathname = '/chat';
    const { container } = render(<MobileBottomNav />);

    expect(container).toBeEmptyDOMElement();
  });

  it('keeps every tab at the 44px touch minimum', () => {
    pathname = '/alerts';
    render(<MobileBottomNav />);

    for (const label of ['Research', 'Overview', 'Journal', 'Alerts']) {
      expect(screen.getByRole('link', { name: label }).className).toContain('min-h-[44px]');
    }
    expect(screen.getByRole('button', { name: /open navigation menu/i }).className).toContain(
      'min-h-[44px]',
    );
  });
});
