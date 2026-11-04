'use client';

// SPDX-License-Identifier: Apache-2.0

// One adaptive mobile bar for viewports below `md`:
// - at the settings top level it lists the five workspace pillars;
// - on a pillar sub-page it lists that pillar's sections with an "All" link.
// The desktop sidebar and the in-page sub-nav are hidden below `md`, so there
// is never a second horizontal bar competing for the same space.
import { IconChevronLeft } from '@tabler/icons-react';
import { Link } from 'next-view-transitions';

import { cn } from '@/lib/formatters/cn';

import { isNavItemActive, type NavGroup } from './nav-groups';
import { tabsForSettingsPath } from '../settings-subnav-tabs';

export function SettingsMobileNav({
  groups,
  pathname,
}: {
  groups: NavGroup[];
  pathname: string | null;
}) {
  const items = groups.flatMap((group) => group.items);
  const sectionTabs = tabsForSettingsPath(pathname);

  return (
    <div className="flex flex-col gap-2 md:hidden">
      <nav
        aria-label={sectionTabs ? 'Settings Sections' : 'Settings Categories'}
        className="surface-well scrollbar-none flex snap-x flex-row gap-1 overflow-x-auto rounded-xl border border-white/5 p-1"
      >
        {sectionTabs ? (
          <Link
            href="/settings"
            aria-label="All settings"
            className="tactile-press text-fg-subtle hover:text-fg inline-flex min-h-11 shrink-0 items-center justify-center gap-1 rounded-lg px-2.5 py-1.5 font-mono text-[11px] font-semibold whitespace-nowrap transition-colors active:translate-y-[0.5px]"
          >
            <IconChevronLeft className="size-3.5" aria-hidden="true" />
            <span>All</span>
          </Link>
        ) : null}

        {sectionTabs ? (
          <>
            <span className="bg-border my-2 h-4 w-px shrink-0" aria-hidden="true" />
            {sectionTabs.map((tab) => {
              const active = pathname === tab.href;
              const Icon = tab.icon;
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'tactile-press flex min-h-11 snap-start items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-all active:translate-y-[0.5px]',
                    active
                      ? 'surface-chip bg-bg-elev-2 text-brand border-brand/30 border font-semibold shadow-xs'
                      : 'text-fg-subtle hover:text-fg',
                  )}
                >
                  <Icon
                    className={cn('size-3.5 shrink-0', active ? 'text-brand' : 'text-fg-subtle')}
                    aria-hidden="true"
                  />
                  <span>{tab.shortLabel}</span>
                </Link>
              );
            })}
          </>
        ) : (
          items.map((item) => {
            const active = isNavItemActive(item, pathname);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'tactile-press flex min-h-11 snap-start items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-all active:translate-y-[0.5px]',
                  active
                    ? 'surface-chip bg-bg-elev-2 text-brand border-brand/30 border font-semibold shadow-xs'
                    : 'text-fg-subtle hover:text-fg',
                )}
              >
                <Icon
                  className={cn('size-3.5 shrink-0', active ? 'text-brand' : 'text-fg-subtle')}
                  aria-hidden="true"
                />
                <span>{item.shortLabel ?? item.label}</span>
              </Link>
            );
          })
        )}
      </nav>
    </div>
  );
}
