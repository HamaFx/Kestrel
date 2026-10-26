'use client';

// SPDX-License-Identifier: Apache-2.0

// Workspace + plugin navigation for the desktop rail.
//
// Deliberately thin: every row is the shared <NavRow>, so the primary list, the
// plugin list and the footer rows (settings/admin) cannot drift apart. Group
// headers disappear in the collapsed rail — a category label has nothing to
// collapse into — and a hairline takes their place.
import { pluginUiRegistry } from '@kestrel/plugin-sdk/ui';

import { pluginIcon } from '@/components/plugins/plugin-icon';
import { cn } from '@/lib/formatters/cn';

import '@/lib/plugins/register-ui';

import { isNavItemActive, PRIMARY_NAV_ITEMS, type NavItem } from '../nav-items';
import { NavRow, NavSection } from '../nav-row';

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
    <div className={cn('flex flex-col gap-3 pt-2', collapsed && 'gap-2')}>
      <nav aria-label="Main Navigation">
        {collapsed ? (
          <span className="border-border/60 mx-2 mb-1 block border-t" aria-hidden="true" />
        ) : null}
        <NavSection label={collapsed ? undefined : 'Workspace'}>
          {PRIMARY_NAV_ITEMS.map((item) => (
            <NavRow
              key={item.href}
              href={item.href}
              label={item.label}
              icon={item.icon}
              active={isNavItemActive(item, pathname)}
              collapsed={collapsed}
            />
          ))}
        </NavSection>
      </nav>

      {pluginNavItems.length > 0 ? (
        <nav aria-label="Plugin navigation">
          {collapsed ? (
            <span className="border-border/60 mx-2 mb-1 block border-t" aria-hidden="true" />
          ) : null}
          <NavSection label={collapsed ? undefined : 'Plugins'}>
            {pluginNavItems.map(({ pluginId, item }) => {
              const navItem: NavItem = {
                href: item.href,
                label: item.label,
                icon: pluginIcon(item.iconName),
                ...(item.description ? { description: item.description } : {}),
                ...(item.match ? { match: item.match } : {}),
              };
              return (
                <NavRow
                  key={`${pluginId}:${item.href}`}
                  href={navItem.href}
                  label={navItem.label}
                  icon={navItem.icon}
                  active={isNavItemActive(navItem, pathname)}
                  collapsed={collapsed}
                />
              );
            })}
          </NavSection>
        </nav>
      ) : null}
    </div>
  );
}
