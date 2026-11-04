// SPDX-License-Identifier: Apache-2.0

// Single source of truth for the in-page settings sections. Both the desktop
// sub-nav and the adaptive mobile bar read from these tabs, so a section can
// never appear in one navigation surface and be missing from the other.
import {
  IconActivity,
  IconBell,
  IconCpu,
  IconDeviceMobilePlus,
  IconKey,
  IconList,
  IconPalette,
  IconRobot,
  IconShield,
} from '@tabler/icons-react';

export interface SubNavTab {
  href: string;
  label: string;
  shortLabel: string;
  icon: typeof IconKey;
}

export const AI_TABS: readonly SubNavTab[] = [
  { href: '/settings/api-keys', label: 'API Keys & Health', shortLabel: 'API Keys', icon: IconKey },
  { href: '/settings/models', label: 'Models & Routing', shortLabel: 'Models', icon: IconCpu },
  {
    href: '/settings/agent',
    label: 'Agent Tools & Overrides',
    shortLabel: 'Agent Tools',
    icon: IconRobot,
  },
];

export const TRADING_TABS: readonly SubNavTab[] = [
  {
    href: '/settings/symbols',
    label: 'Watchlist Symbols',
    shortLabel: 'Symbols',
    icon: IconList,
  },
  {
    href: '/settings/notifications',
    label: 'Alerts & Telegram',
    shortLabel: 'Notifications',
    icon: IconBell,
  },
];

export const ACCOUNT_TABS: readonly SubNavTab[] = [
  {
    href: '/settings/profile',
    label: 'Profile & Security',
    shortLabel: 'Security',
    icon: IconShield,
  },
  {
    href: '/settings/appearance',
    label: 'Appearance & Data',
    shortLabel: 'Appearance',
    icon: IconPalette,
  },
  {
    href: '/settings/usage',
    label: 'Activity & Quota',
    shortLabel: 'Activity',
    icon: IconActivity,
  },
  {
    href: '/settings/install',
    label: 'Install App',
    shortLabel: 'Install',
    icon: IconDeviceMobilePlus,
  },
];

const PILLAR_TABS: ReadonlyArray<{ pillarHref: string; tabs: readonly SubNavTab[] }> = [
  { pillarHref: '/settings/api-keys', tabs: AI_TABS },
  { pillarHref: '/settings/symbols', tabs: TRADING_TABS },
  { pillarHref: '/settings/profile', tabs: ACCOUNT_TABS },
];

/** The section tabs for the current settings page, or null at the top level. */
export function tabsForSettingsPath(pathname: string | null): readonly SubNavTab[] | null {
  if (!pathname) return null;
  return (
    PILLAR_TABS.find((pillar) => pillar.tabs.some((tab) => tab.href === pathname))?.tabs ?? null
  );
}
