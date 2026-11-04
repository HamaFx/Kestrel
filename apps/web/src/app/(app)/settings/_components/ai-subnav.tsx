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
import { m } from 'motion/react';
import { Link } from 'next-view-transitions';
import { usePathname } from 'next/navigation';

import { MOTION_PRESETS } from '@/components/ui/motion-config';
import { cn } from '@/lib/formatters/cn';

import { ACCOUNT_TABS, AI_TABS, TRADING_TABS, type SubNavTab } from './settings-subnav-tabs';

function PillarSubNav({
  ariaLabel,
  layoutId,
  tabs,
}: {
  ariaLabel: string;
  layoutId: string;
  tabs: readonly SubNavTab[];
}) {
  const pathname = usePathname();

  return (
    <nav
      aria-label={ariaLabel}
      className="surface-well scrollbar-none flex flex-row gap-1 overflow-x-auto rounded-xl border border-white/5 p-1 max-md:hidden"
    >
      {tabs.map((tab) => {
        const active = pathname === tab.href;
        const Icon = tab.icon;

        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'tactile-press relative flex min-h-9 flex-1 items-center justify-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-all active:translate-y-[0.5px]',
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

export function AISubNav() {
  return (
    <PillarSubNav
      ariaLabel="AI & Intelligence Sections"
      layoutId="settings-ai-subnav-pill"
      tabs={AI_TABS}
    />
  );
}

export function TradingSubNav() {
  return (
    <PillarSubNav
      ariaLabel="Trading & Alerts Sections"
      layoutId="settings-trading-subnav-pill"
      tabs={TRADING_TABS}
    />
  );
}

export function AccountSubNav() {
  return (
    <PillarSubNav
      ariaLabel="Account & System Sections"
      layoutId="settings-account-subnav-pill"
      tabs={ACCOUNT_TABS}
    />
  );
}
