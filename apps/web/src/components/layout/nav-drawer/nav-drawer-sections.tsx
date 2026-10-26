'use client';

// SPDX-License-Identifier: Apache-2.0

// Section list for the mobile drawer. Same rows as the desktop rail, with the
// one-line blurb that only the roomier drawer has space for.
import { pluginUiRegistry } from '@kestrel/plugin-sdk/ui';

import { pluginIcon } from '@/components/plugins/plugin-icon';

import {
  ADMIN_NAV_ITEMS,
  isNavItemActive,
  PRIMARY_NAV_ITEMS,
  SECONDARY_NAV_ITEMS,
  type NavItem,
} from '../nav-items';
import { NavRow, NavSection } from '../nav-row';

export function NavDrawerSections({
  pathname,
  isAdmin,
  installedPluginIds,
}: {
  pathname: string;
  isAdmin?: boolean;
  installedPluginIds: readonly string[];
}) {
  const pluginNavItems = pluginUiRegistry.listNavItems(installedPluginIds);

  return (
    <nav
      aria-label="Primary"
      className="scrollbar-hide flex flex-1 flex-col gap-3 overflow-y-auto px-3 py-2"
    >
      <NavSection label="Workspace">
        {PRIMARY_NAV_ITEMS.map((item) => (
          <NavRow
            key={item.href}
            href={item.href}
            label={item.label}
            icon={item.icon}
            description={item.description}
            active={isNavItemActive(item, pathname)}
          />
        ))}
      </NavSection>

      {pluginNavItems.length > 0 ? (
        <NavSection label="Plugins">
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
                description={navItem.description}
                active={isNavItemActive(navItem, pathname)}
              />
            );
          })}
        </NavSection>
      ) : null}

      <NavSection label="Preferences">
        {[...SECONDARY_NAV_ITEMS, ...(isAdmin ? ADMIN_NAV_ITEMS : [])].map((item) => (
          <NavRow
            key={item.href}
            href={item.href}
            label={item.label}
            icon={item.icon}
            description={item.description}
            active={isNavItemActive(item, pathname)}
          />
        ))}
      </NavSection>
    </nav>
  );
}
