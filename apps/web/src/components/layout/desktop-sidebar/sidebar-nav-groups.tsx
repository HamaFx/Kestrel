'use client';

// SPDX-License-Identifier: Apache-2.0

// Primary + plugin nav groups for the desktop sidebar.
import { pluginUiRegistry } from '@kestrel/plugin-sdk/ui';
import { m } from 'motion/react';
import { Link } from 'next-view-transitions';

import { pluginIcon } from '@/components/plugins/plugin-icon';
import { MOTION_PRESETS } from '@/components/ui/motion-config';
import { Tooltip } from '@/components/ui/tooltip';
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
      {/* Primary Navigation Section Header */}
      {!collapsed ? (
        <div className="flex items-center gap-2 px-2.5 pt-2 pb-1 font-mono text-[9px] font-semibold tracking-wider text-fg-subtle/70 uppercase">
          <span>// NAVIGATION</span>
          <span className="h-px flex-1 bg-white/[0.06]" />
        </div>
      ) : (
        <div className="border-border/60 my-1 border-t" aria-hidden />
      )}

      {/* Primary Nav List */}
      <nav className="flex flex-col gap-1" aria-label="Main Navigation">
        {PRIMARY_NAV_ITEMS.map((item, index) => {
          const active = isNavItemActive(item, pathname);
          const Icon = item.icon;
          const code = String(index + 1).padStart(2, '0');

          const content = (
            <Link
              key={item.href}
              href={item.href}
              prefetch={true}
              aria-label={item.label}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'group relative flex items-center rounded-lg px-2.5 py-2 text-sm font-medium transition-colors select-none active:translate-y-[0.5px]',
                collapsed ? 'mx-auto size-10 justify-center p-0' : 'gap-2.5',
                active
                  ? 'text-fg font-semibold'
                  : 'text-fg-muted hover:text-fg hover:bg-white/[0.04]',
              )}
            >
              {active && (
                <>
                  {/* Fluid sliding background pill */}
                  <m.span
                    layoutId="sidebar-active-bg"
                    aria-hidden="true"
                    className="bg-bg-elev-2/95 border-brand/40 pointer-events-none absolute inset-0 rounded-lg border shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06),0_2px_10px_rgba(0,0,0,0.4)]"
                    transition={MOTION_PRESETS.layout}
                  />
                  {/* Fluid sliding neon brand indicator laser blade */}
                  <m.span
                    layoutId="sidebar-active-pill"
                    aria-hidden="true"
                    className={cn(
                      'bg-brand pointer-events-none absolute rounded-full shadow-[0_0_12px_rgba(255,54,22,0.85)]',
                      collapsed
                        ? 'left-1 top-2.5 bottom-2.5 w-1'
                        : 'left-1.5 h-4 w-1',
                    )}
                    transition={MOTION_PRESETS.layout}
                  />
                </>
              )}

              {/* Technical Code Index (e.g. 01, 02) */}
              {!collapsed && (
                <span
                  className={cn(
                    'z-10 font-mono text-[10px] font-bold tracking-tighter transition-colors',
                    active ? 'text-brand' : 'text-fg-subtle/50 group-hover:text-fg-subtle',
                  )}
                >
                  {code}
                </span>
              )}

              <Icon
                className={cn(
                  'size-4.5 shrink-0 transition-colors z-10',
                  active ? 'text-brand' : 'text-fg-subtle group-hover:text-fg',
                )}
                strokeWidth={active ? 2 : 1.75}
                aria-hidden="true"
              />

              {!collapsed && (
                <span className="z-10 truncate font-sans text-[13px] tracking-tight">
                  {item.label}
                </span>
              )}

              {!collapsed && item.shortcut && (
                <kbd
                  aria-hidden="true"
                  className={cn(
                    'text-fg-subtle/70 bg-white/[0.04] border-white/[0.06] z-10 ml-auto rounded border px-1.5 py-0.5 font-mono text-[9px] font-normal tracking-wider transition-opacity',
                    active ? 'opacity-90' : 'opacity-0 group-hover:opacity-100',
                  )}
                >
                  {item.shortcut}
                </kbd>
              )}
            </Link>
          );

          const renderedItem = collapsed ? (
            <Tooltip
              key={item.href}
              label={`${code} // ${item.label}`}
              side="right"
              shortcut={item.shortcut}
              className="w-full justify-center"
            >
              {content}
            </Tooltip>
          ) : (
            content
          );

          return renderedItem;
        })}
      </nav>

      {pluginNavItems.length > 0 ? (
        <nav className="flex flex-col gap-1" aria-label="Plugin navigation">
          {!collapsed ? (
            <div className="text-fg-subtle/70 flex items-center gap-2 px-2.5 pt-3 pb-1 font-mono text-[9px] font-semibold tracking-wider uppercase">
              <span>// PLUGINS</span>
              <span className="h-px flex-1 bg-white/[0.06]" />
            </div>
          ) : (
            <div className="border-border/60 my-1 border-t" aria-hidden />
          )}
          {pluginNavItems.map(({ pluginId, item }) => {
            const Icon = pluginIcon(item.iconName);
            const candidates = item.match ?? [item.href];
            const active = candidates.some(
              (path) => pathname === path || pathname.startsWith(`${path}/`),
            );

            const content = (
              <Link
                key={`${pluginId}:${item.href}`}
                href={item.href}
                prefetch={true}
                aria-label={item.label}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'group relative flex items-center rounded-lg px-2.5 py-2 text-sm font-medium transition-colors select-none active:translate-y-[0.5px]',
                  collapsed ? 'mx-auto size-10 justify-center p-0' : 'gap-3',
                  active
                    ? 'text-fg font-semibold'
                    : 'text-fg-muted hover:text-fg hover:bg-white/[0.04]',
                )}
              >
                {active && (
                  <>
                    <m.span
                      layoutId="sidebar-active-bg"
                      aria-hidden="true"
                      className="bg-bg-elev-2/90 border-brand/35 pointer-events-none absolute inset-0 rounded-lg border shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06),0_2px_8px_rgba(0,0,0,0.3)]"
                      transition={MOTION_PRESETS.layout}
                    />
                    <m.span
                      layoutId="sidebar-active-pill"
                      aria-hidden="true"
                      className={cn(
                        'bg-brand pointer-events-none absolute rounded-full shadow-[0_0_10px_rgba(255,54,22,0.7)]',
                        collapsed
                          ? 'left-1 top-2.5 bottom-2.5 w-1'
                          : 'left-1.5 h-4 w-1',
                      )}
                      transition={MOTION_PRESETS.layout}
                    />
                  </>
                )}
                <Icon
                  className={cn(
                    'size-5 shrink-0 transition-colors z-10',
                    active ? 'text-brand' : 'text-fg-subtle group-hover:text-fg',
                    active && !collapsed && 'ml-0.5',
                  )}
                  strokeWidth={active ? 2 : 1.75}
                  aria-hidden="true"
                />
                {!collapsed && (
                  <span className="z-10 truncate font-sans text-[13px] tracking-tight">
                    {item.label}
                  </span>
                )}
              </Link>
            );

            return collapsed ? (
              <Tooltip
                key={`${pluginId}:${item.href}`}
                label={item.label}
                side="right"
                className="w-full justify-center"
              >
                {content}
              </Tooltip>
            ) : (
              content
            );
          })}
        </nav>
      ) : null}
    </>
  );
}
