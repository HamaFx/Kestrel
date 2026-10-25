'use client';

// SPDX-License-Identifier: Apache-2.0

// Two-tier grouped navigation for viewports below `md`.
import { Link } from 'next-view-transitions';

import { cn } from '@/lib/formatters/cn';

import { isNavItemActive, type NavGroup } from './nav-groups';

export function SettingsMobileNav({
  groups,
  activeGroup,
  pathname,
}: {
  groups: NavGroup[];
  activeGroup: NavGroup;
  pathname: string | null;
}) {
  return (
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
            const active = isNavItemActive(item, pathname);
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
  );
}
