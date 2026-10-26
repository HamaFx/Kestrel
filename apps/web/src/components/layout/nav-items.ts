/**
 * Copyright 2026 Kestrel
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {
  IconBell,
  IconBook,
  IconLayoutDashboard,
  IconMessageCircle,
  IconNews,
  IconSettings,
  IconShield,
  type Icon,
} from '@tabler/icons-react';

export interface NavItem {
  href: string;
  label: string;
  icon: Icon;
  description?: string;
  match?: readonly string[];
  shortcut?: string;
  badge?: string | number;
}

/**
 * Unified primary navigation contract.
 * Promotes Research as the core workspace and demotes Dashboard to Overview.
 * Market consolidates News + Calendar. Chart is docked inside Research or reachable via ⌘K.
 */
export const PRIMARY_NAV_ITEMS: readonly NavItem[] = [
  {
    href: '/chat',
    label: 'Research',
    icon: IconMessageCircle,
    match: ['/chat'],
    description: 'Ask your 4-desk AI committee & view docked charts',
    shortcut: '⌘1',
  },
  {
    href: '/dashboard',
    label: 'Overview',
    icon: IconLayoutDashboard,
    match: ['/dashboard'],
    description: 'Briefing & performance overview',
    shortcut: '⌘2',
  },
  {
    href: '/journal',
    label: 'Journal',
    icon: IconBook,
    match: ['/journal'],
    description: 'Trades, R-multiples & equity curve',
    shortcut: '⌘3',
  },
  {
    href: '/news',
    label: 'Market',
    icon: IconNews,
    match: ['/news', '/calendar', '/chart'],
    description: 'Market headlines, economic calendar & live charts',
    shortcut: '⌘4',
  },
  {
    href: '/alerts',
    label: 'Alerts',
    icon: IconBell,
    match: ['/alerts'],
    description: 'Price & indicator triggers',
    shortcut: '⌘5',
  },
];

export const SECONDARY_NAV_ITEMS: readonly NavItem[] = [
  {
    href: '/settings',
    label: 'Settings',
    icon: IconSettings,
    match: ['/settings'],
    description: 'Subscription, risk & alerts',
    shortcut: '⌘,',
  },
];

export const ADMIN_NAV_ITEMS: readonly NavItem[] = [
  {
    href: '/admin',
    label: 'Admin',
    icon: IconShield,
    match: ['/admin'],
    description: 'Platform controls & system health',
  },
];

export function isNavItemActive(item: NavItem, pathname: string): boolean {
  const candidates = item.match ?? [item.href];
  return candidates.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}
