'use client';

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

// Shared Market Intelligence sub-navigation.
//
// The primary sidebar exposes a single "Market" pillar (`/news`), but the
// market workspace spans three routes: the headlines wire, the macro
// economic calendar, and the live pro chart. Rendering this sub-nav on each
// of those routes lets a trader hop between them in one click instead of
// guessing that `/calendar` or `/chart/XAUUSD` exist.
//
// Mirrors the visual contract of the settings <AISubNav />: a recessed
// `surface-well` rail of chips where the active route lifts onto a
// `surface-chip` with the brand accent.
import { IconCalendarEvent, IconChartCandle, IconNews } from '@tabler/icons-react';
import { Link } from 'next-view-transitions';
import { usePathname } from 'next/navigation';

import { cn } from '@/lib/formatters/cn';

interface MarketTab {
  href: string;
  label: string;
  shortLabel: string;
  icon: typeof IconNews;
  /** Path prefixes that should light this tab up. */
  match: readonly string[];
}

export const MARKET_TABS: readonly MarketTab[] = [
  {
    href: '/news',
    label: 'News Wire',
    shortLabel: 'News',
    icon: IconNews,
    match: ['/news'],
  },
  {
    href: '/calendar',
    label: 'Economic Calendar',
    shortLabel: 'Calendar',
    icon: IconCalendarEvent,
    match: ['/calendar'],
  },
  {
    href: '/chart/XAUUSD',
    label: 'Live Chart',
    shortLabel: 'Chart',
    icon: IconChartCandle,
    match: ['/chart'],
  },
];

/** Whether a market tab owns the current pathname (exact or nested route). */
export function isMarketTabActive(tab: MarketTab, pathname: string | null): boolean {
  if (!pathname) return false;
  return tab.match.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function MarketSubNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Market Intelligence Sections"
      className="surface-well scrollbar-hide flex flex-row gap-1 overflow-x-auto rounded-xl border border-white/5 p-1"
    >
      {MARKET_TABS.map((tab) => {
        const active = isMarketTabActive(tab, pathname);
        const Icon = tab.icon;

        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'tactile-press flex min-h-9 flex-1 items-center justify-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-all active:translate-y-[0.5px]',
              active
                ? 'surface-chip bg-bg-elev-2 text-brand font-semibold shadow-xs'
                : 'text-fg-subtle hover:text-fg hover:bg-bg-elev-1/50',
            )}
          >
            <Icon className={cn('size-4 shrink-0', active ? 'text-brand' : 'text-fg-subtle')} />
            <span className="hidden sm:inline">{tab.label}</span>
            <span className="sm:hidden">{tab.shortLabel}</span>
          </Link>
        );
      })}
    </nav>
  );
}
