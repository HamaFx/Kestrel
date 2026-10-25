'use client';

// SPDX-License-Identifier: Apache-2.0

// Grouped settings sidebar for viewports at `md` and above.
import { Link } from 'next-view-transitions';

import { cn } from '@/lib/formatters/cn';

import { isNavItemActive, type NavGroup } from './nav-groups';

export function SettingsDesktopNav({
  groups,
  pathname,
}: {
  groups: NavGroup[];
  pathname: string | null;
}) {
  return (
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
                  const active = isNavItemActive(item, pathname);
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
  );
}
