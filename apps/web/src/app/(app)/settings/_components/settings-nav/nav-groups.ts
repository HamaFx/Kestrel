// SPDX-License-Identifier: Apache-2.0

// Settings navigation groups + item types.
//
// Consolidated from 11 sidebar links into 4 clean, self-contained workspace
// pillars. Sub-sections within AI & Intelligence, Trading & Alerts, and
// Account & System switch via their in-page <AISubNav />, <TradingSubNav />,
// and <AccountSubNav /> controls.

import { IconCpu, IconList, IconPuzzle, IconSettings, IconShield } from '@tabler/icons-react';

export interface NavItem {
  href: string;
  label: string;
  shortLabel?: string;
  icon: React.ComponentType<{ className?: string }>;
  exact?: boolean;
  /** Additional path prefixes that keep this pillar highlighted. */
  match?: readonly string[];
}

export interface NavGroup {
  id: string;
  label: string;
  shortLabel: string;
  items: NavItem[];
}

export const BASE_NAV_GROUPS: NavGroup[] = [
  {
    id: 'workspace',
    label: 'Workspace',
    shortLabel: 'Workspace',
    items: [
      {
        href: '/settings',
        label: 'Overview',
        shortLabel: 'Overview',
        icon: IconSettings,
        exact: true,
      },
      {
        href: '/settings/api-keys',
        label: 'AI & Intelligence',
        shortLabel: 'AI & Keys',
        icon: IconCpu,
        match: ['/settings/api-keys', '/settings/models', '/settings/agent'],
      },
      {
        href: '/settings/symbols',
        label: 'Trading & Alerts',
        shortLabel: 'Trading',
        icon: IconList,
        match: ['/settings/symbols', '/settings/notifications', '/settings/telegram'],
      },
      {
        href: '/settings/plugins',
        label: 'Plugins',
        shortLabel: 'Plugins',
        icon: IconPuzzle,
        match: ['/settings/plugins'],
      },
      {
        href: '/settings/profile',
        label: 'Account & System',
        shortLabel: 'Account',
        icon: IconShield,
        match: [
          '/settings/profile',
          '/settings/security',
          '/settings/appearance',
          '/settings/data',
          '/settings/usage',
          '/settings/install',
        ],
      },
    ],
  },
];

/** Whether a nav item matches the current pathname (exact, match prefixes, or prefix). */
export function isNavItemActive(item: NavItem, pathname: string | null): boolean {
  if (!pathname) return false;
  if (item.exact) return pathname === item.href;
  if (item.match && item.match.length > 0) {
    return item.match.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  }
  return pathname.startsWith(item.href);
}
