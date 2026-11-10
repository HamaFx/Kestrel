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

import { IconBell, IconCalendarEvent, IconNews } from '@tabler/icons-react';
import { m } from 'motion/react';
import { Link } from 'next-view-transitions';
import { usePathname } from 'next/navigation';
import type { ComponentType } from 'react';

import { MOTION_PRESETS } from '@/components/ui/motion-config';
import { cn } from '@/lib/formatters/cn';

interface PillarSubNavTab {
  href: string;
  label: string;
  shortLabel: string;
  icon: ComponentType<{ className?: string }>;
  /** Optional path prefixes that should light this tab up. */
  match?: readonly string[];
}

const MARKET_TABS: readonly PillarSubNavTab[] = [
  {
    href: '/news',
    label: 'News & Macro',
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
    href: '/alerts',
    label: 'Price Alerts',
    shortLabel: 'Alerts',
    icon: IconBell,
    match: ['/alerts'],
  },
];

function isSubNavTabActive(tab: PillarSubNavTab, pathname: string | null): boolean {
  if (!pathname) return false;
  if (tab.match && tab.match.length > 0) {
    return tab.match.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  }
  return pathname === tab.href;
}

export function PillarSubNav({
  ariaLabel,
  layoutId,
  tabs,
  className,
}: {
  ariaLabel: string;
  layoutId: string;
  tabs: readonly PillarSubNavTab[];
  className?: string;
}) {
  const pathname = usePathname();

  return (
    <nav
      aria-label={ariaLabel}
      className={cn(
        'surface-well scrollbar-hide flex flex-row gap-1 overflow-x-auto rounded-xl border border-white/5 p-1',
        className,
      )}
    >
      {tabs.map((tab) => {
        const active = isSubNavTabActive(tab, pathname);
        const Icon = tab.icon;

        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'tactile-press focus-visible:ring-brand relative flex min-h-9 flex-1 items-center justify-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-all focus:outline-none focus-visible:ring-2 active:translate-y-[0.5px]',
              active ? 'text-brand font-semibold' : 'text-fg-subtle hover:text-fg',
            )}
          >
            {active ? (
              <m.span
                layoutId={layoutId}
                aria-hidden="true"
                className="surface-chip bg-bg-elev-2 border-brand/30 absolute inset-0 -z-10 rounded-lg border shadow-xs"
                transition={MOTION_PRESETS.layout}
              />
            ) : null}
            <Icon className={cn('size-4 shrink-0', active ? 'text-brand' : 'text-fg-subtle')} />
            <span className="hidden sm:inline">{tab.label}</span>
            <span className="sm:hidden">{tab.shortLabel}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export function MarketSubNav() {
  return (
    <PillarSubNav
      ariaLabel="Market Intelligence Sections"
      layoutId="market-subnav-active-pill"
      tabs={MARKET_TABS}
    />
  );
}
