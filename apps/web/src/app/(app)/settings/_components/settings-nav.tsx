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
import {
  IconActivity,
  IconArrowLeft,
  IconBell,
  IconChevronRight,
  IconList,
  IconPalette,
  IconPuzzle,
  IconSettings,
  IconShield,
} from '@tabler/icons-react';
import { Link } from 'next-view-transitions';
import { usePathname } from 'next/navigation';

import { cn } from '@/lib/formatters/cn';

export interface NavItem {
  href: string;
  label: string;
  shortLabel?: string;
  icon: React.ComponentType<{ className?: string }>;
  exact?: boolean;
}

export interface NavGroup {
  id: string;
  label: string;
  shortLabel: string;
  items: NavItem[];
}

const BASE_NAV_GROUPS: NavGroup[] = [
  {
    id: 'overview',
    label: 'Overview',
    shortLabel: 'Overview',
    items: [
      {
        href: '/settings',
        label: 'General',
        shortLabel: 'Overview',
        icon: IconSettings,
        exact: true,
      },
      {
        href: '/settings/plugins',
        label: 'Plugins',
        shortLabel: 'Plugins',
        icon: IconPuzzle,
      },
    ],
  },
  {
    id: 'trading',
    label: 'Trading & Risk',
    shortLabel: 'Trading',
    items: [
      {
        href: '/settings/symbols',
        label: 'Watchlist Symbols',
        shortLabel: 'Symbols',
        icon: IconList,
      },
    ],
  },
  {
    id: 'notifications',
    label: 'Alerts & Delivery',
    shortLabel: 'Alerts',
    items: [
      {
        href: '/settings/notifications',
        label: 'Notifications & Telegram',
        shortLabel: 'Channels',
        icon: IconBell,
      },
    ],
  },
  {
    id: 'account',
    label: 'Account & Workspace',
    shortLabel: 'Account',
    items: [
      {
        href: '/settings/profile',
        label: 'Profile & Security',
        shortLabel: 'Profile',
        icon: IconShield,
      },
      {
        href: '/settings/appearance',
        label: 'Appearance & Data',
        shortLabel: 'Display',
        icon: IconPalette,
      },
      {
        href: '/settings/usage',
        label: 'Activity & Quota',
        shortLabel: 'Activity',
        icon: IconActivity,
      },
    ],
  },
];

export function SettingsNav() {
  const pathname = usePathname();
  const isSubPage = pathname !== '/settings';

  const groups = BASE_NAV_GROUPS;
  const allItems = groups.flatMap((g) => g.items);
  const currentItem = allItems.find((item) =>
    item.exact ? pathname === item.href : pathname?.startsWith(item.href),
  );

  const activeGroup =
    groups.find((g) =>
      g.items.some((item) =>
        item.exact ? pathname === item.href : pathname?.startsWith(item.href),
      ),
    ) ?? groups[0]!;

  return (
    <div className="flex shrink-0 flex-col gap-3 md:w-60 lg:w-64">
      {/* Breadcrumb for subpages on desktop & mobile */}
      {isSubPage && (
        <nav aria-label="Breadcrumb" className="text-fg-subtle flex items-center gap-1.5 text-xs">
          <Link
            href="/settings"
            className="hover:text-fg inline-flex shrink-0 items-center gap-1.5 transition-colors"
          >
            <IconArrowLeft className="size-3.5" />
            Settings
          </Link>
          {currentItem && (
            <>
              <IconChevronRight className="text-fg-subtle/60 size-3 shrink-0" aria-hidden />
              <span className="text-fg truncate font-medium" aria-current="page">
                {currentItem.label}
              </span>
            </>
          )}
        </nav>
      )}

      {/* MOBILE NAVIGATION: Two-tier grouped navigation (< md) */}
      <div className="flex flex-col gap-2 md:hidden">
        <nav
          aria-label="Settings Categories"
          className="flex snap-x scrollbar-none flex-row gap-1.5 overflow-x-auto pb-1"
        >
          {groups.map((group) => {
            const isGroupActive = group.id === activeGroup.id;
            const primaryHref = group.items[0]?.href ?? '/settings';

            return (
              <Link
                key={group.id}
                href={primaryHref}
                aria-current={isGroupActive ? 'true' : undefined}
                className={cn(
                  'tactile-press flex min-h-10 snap-start items-center justify-center rounded-xl px-3.5 py-2 text-xs font-semibold whitespace-nowrap transition-all active:translate-y-[0.5px]',
                  isGroupActive
                    ? 'surface-panel bg-brand/12 text-brand ring-brand/30 shadow-[var(--shadow-chip)] ring-1'
                    : 'text-fg-subtle bg-bg-elev-1/70 hover:bg-bg-elev-2 hover:text-fg border border-white/5',
                )}
              >
                {group.shortLabel}
              </Link>
            );
          })}
        </nav>

        {activeGroup.items.length > 1 && (
          <nav
            aria-label={`${activeGroup.label} Subsections`}
            className="surface-well flex scrollbar-none flex-row gap-1 overflow-x-auto rounded-xl border border-white/5 p-1"
          >
            {activeGroup.items.map((item) => {
              const active = item.exact ? pathname === item.href : pathname?.startsWith(item.href);
              const Icon = item.icon;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'tactile-press flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-all active:translate-y-[0.5px]',
                    active
                      ? 'surface-chip bg-bg-elev-2 text-fg font-semibold shadow-xs'
                      : 'text-fg-subtle hover:text-fg',
                  )}
                >
                  <Icon className="size-3.5 shrink-0" />
                  <span>{item.shortLabel ?? item.label}</span>
                </Link>
              );
            })}
          </nav>
        )}
      </div>

      {/* DESKTOP NAVIGATION: Grouped sidebar (>= md) */}
      <aside className="hidden w-full md:block">
        <nav
          aria-label="Settings"
          className="surface-panel flex flex-col gap-4 rounded-xl border border-white/5 p-2 shadow-[var(--shadow-chip)]"
        >
          {groups.map((group) => {
            return (
              <div key={group.id} className="flex flex-col gap-0.5">
                <span className="text-fg-subtle/80 px-2.5 pt-1.5 pb-1 text-[11px] font-semibold tracking-wider uppercase select-none">
                  {group.label}
                </span>

                <div className="flex flex-col gap-0.5">
                  {group.items.map((item) => {
                    const active = item.exact
                      ? pathname === item.href
                      : pathname?.startsWith(item.href);
                    const Icon = item.icon;

                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        aria-current={active ? 'page' : undefined}
                        className={cn(
                          'tactile-press flex min-h-9 items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium whitespace-nowrap transition-all active:translate-y-[0.5px]',
                          active
                            ? 'bg-brand/12 text-brand ring-brand/25 font-semibold shadow-xs ring-1'
                            : 'text-fg-subtle hover:bg-bg-elev-2/80 hover:text-fg',
                        )}
                      >
                        <Icon
                          className={cn(
                            'size-4 shrink-0 transition-colors',
                            active ? 'text-brand' : 'text-fg-subtle',
                          )}
                        />
                        <span className="truncate">{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>
      </aside>
    </div>
  );
}
