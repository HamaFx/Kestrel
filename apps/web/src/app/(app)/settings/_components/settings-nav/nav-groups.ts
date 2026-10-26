// SPDX-License-Identifier: Apache-2.0

// Settings navigation groups + item types.

import {
  IconActivity,
  IconBell,
  IconCpu,
  IconDeviceMobilePlus,
  IconKey,
  IconList,
  IconPalette,
  IconPuzzle,
  IconRobot,
  IconSettings,
  IconShield,
} from '@tabler/icons-react';

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

export const BASE_NAV_GROUPS: NavGroup[] = [
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
    id: 'ai',
    label: 'AI & Intelligence',
    shortLabel: 'AI',
    items: [
      {
        href: '/settings/api-keys',
        label: 'API Keys & Vault',
        shortLabel: 'API Keys',
        icon: IconKey,
      },
      {
        href: '/settings/models',
        label: 'Models & Routing',
        shortLabel: 'Models',
        icon: IconCpu,
      },
      {
        href: '/settings/agent',
        label: 'Agent Preferences',
        shortLabel: 'Agent',
        icon: IconRobot,
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
        href: '/settings/install',
        label: 'Install app',
        shortLabel: 'Install',
        icon: IconDeviceMobilePlus,
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

/** Whether a nav item matches the current pathname (exact or prefix). */
export function isNavItemActive(item: NavItem, pathname: string | null): boolean {
  return item.exact ? pathname === item.href : Boolean(pathname?.startsWith(item.href));
}
