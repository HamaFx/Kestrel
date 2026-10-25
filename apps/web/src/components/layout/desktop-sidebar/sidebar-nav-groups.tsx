'use client';

// SPDX-License-Identifier: Apache-2.0

// Primary + plugin nav groups for the desktop sidebar.
import { pluginUiRegistry } from '@kestrel/plugin-sdk/ui';
import { Link } from 'next-view-transitions';

import { pluginIcon } from '@/components/plugins/plugin-icon';
import { cn } from '@/lib/formatters/cn';

import '@/lib/plugins/register-ui';

import { isNavItemActive, PRIMARY_NAV_ITEMS } from '../nav-items';

export function SidebarNavGroups({
  collapsed,
  pathname,
  installedPluginIds,
}: {
  collapsed: boolean;
  pathname: string;
  installedPluginIds: readonly string[];
}) {
  const pluginNavItems = pluginUiRegistry.listNavItems(installedPluginIds);

  return (
    <>
      {/* Primary Nav List */}
      <nav className="flex flex-col gap-1" aria-label="Main Navigation">
        {PRIMARY_NAV_ITEMS.map((item) => {
          const active = isNavItemActive(item, pathname);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              prefetch={true}
              aria-label={item.label}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'group relative flex items-center gap-3 rounded-md px-2.5 py-2 text-sm font-medium transition-all active:translate-y-[0.5px]',
                active
                  ? 'bg-bg-elev-2 text-fg surface-chip border-brand/40 shadow-sm'
                  : 'text-fg-muted hover:text-fg hover:bg-bg-elev-2/50 border border-transparent',
              )}
              title={collapsed ? item.label : undefined}
            >
              {active && (
                <span
                  aria-hidden="true"
                  className="bg-brand absolute left-1 h-3.5 w-1 rounded-full shadow-[0_0_8px_rgba(255,54,22,0.6)]"
                />
              )}
              <Icon
                className={cn(
                  'size-5 shrink-0 transition-colors',
                  active ? 'text-brand' : 'text-fg-subtle group-hover:text-fg',
                  active && 'ml-1',
                )}
                aria-hidden="true"
              />
              {!collapsed && (
                <span className={cn('truncate font-sans', active && 'font-medium')}>
                  {item.label}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {pluginNavItems.length > 0 ? (
        <nav className="flex flex-col gap-1" aria-label="Plugin navigation">
          {!collapsed ? (
            <p className="text-fg-subtle px-2.5 pt-2 pb-0.5 text-[10px] font-semibold tracking-wider uppercase">
              Plugins
            </p>
          ) : (
            <div className="border-border/60 my-1 border-t" aria-hidden />
          )}
          {pluginNavItems.map(({ pluginId, item }) => {
            const Icon = pluginIcon(item.iconName);
            const candidates = item.match ?? [item.href];
            const active = candidates.some(
              (path) => pathname === path || pathname.startsWith(`${path}/`),
            );
            return (
              <Link
                key={`${pluginId}:${item.href}`}
                href={item.href}
                prefetch={true}
                aria-label={item.label}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'group relative flex items-center gap-3 rounded-md px-2.5 py-2 text-sm font-medium transition-all active:translate-y-[0.5px]',
                  active
                    ? 'bg-bg-elev-2 text-fg surface-chip border-brand/40 shadow-sm'
                    : 'text-fg-muted hover:text-fg hover:bg-bg-elev-2/50 border border-transparent',
                )}
                title={collapsed ? item.label : undefined}
              >
                {active && (
                  <span
                    aria-hidden="true"
                    className="bg-brand absolute left-1 h-3.5 w-1 rounded-full shadow-[0_0_8px_rgba(255,54,22,0.6)]"
                  />
                )}
                <Icon
                  className={cn(
                    'size-5 shrink-0 transition-colors',
                    active ? 'text-brand' : 'text-fg-subtle group-hover:text-fg',
                    active && 'ml-1',
                  )}
                  aria-hidden="true"
                />
                {!collapsed && <span className="truncate font-sans">{item.label}</span>}
              </Link>
            );
          })}
        </nav>
      ) : null}
    </>
  );
}
