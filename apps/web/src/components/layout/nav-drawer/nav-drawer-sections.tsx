'use client';

// SPDX-License-Identifier: Apache-2.0

// Nav groups for the drawer: primary, preferences, installed plugins and
// (for admins) administration.
import { pluginUiRegistry } from '@kestrel/plugin-sdk/ui';

import { pluginIcon } from '@/components/plugins/plugin-icon';

import {
  ADMIN_NAV_ITEMS,
  isNavItemActive,
  PRIMARY_NAV_ITEMS,
  SECONDARY_NAV_ITEMS,
  type NavItem,
} from '../nav-items';
import { NavLink, Section } from './nav-link';

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
    <nav aria-label="Primary" className="scrollbar-hide flex-1 overflow-y-auto px-3 pb-4">
      <Section label="Navigation">
        {PRIMARY_NAV_ITEMS.map((item) => (
          <NavLink key={item.href} item={item} active={isNavItemActive(item, pathname)} />
        ))}
      </Section>

      <Section label="Preferences">
        {SECONDARY_NAV_ITEMS.map((item) => (
          <NavLink key={item.href} item={item} active={isNavItemActive(item, pathname)} />
        ))}
      </Section>

      {pluginNavItems.length > 0 ? (
        <Section label="Plugins">
          {pluginNavItems.map(({ pluginId, item }) => {
            const navItem: NavItem = {
              href: item.href,
              label: item.label,
              icon: pluginIcon(item.iconName),
              ...(item.description ? { description: item.description } : {}),
              ...(item.match ? { match: item.match } : {}),
            };
            return (
              <NavLink
                key={`${pluginId}:${item.href}`}
                item={navItem}
                active={isNavItemActive(navItem, pathname)}
              />
            );
          })}
        </Section>
      ) : null}

      {isAdmin ? (
        <Section label="Administration">
          {ADMIN_NAV_ITEMS.map((item) => (
            <NavLink key={item.href} item={item} active={isNavItemActive(item, pathname)} />
          ))}
        </Section>
      ) : null}
    </nav>
  );
}
