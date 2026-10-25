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

// SPDX-License-Identifier: Apache-2.0

/**
 * Static command registry for the cmd-K palette.
 */

import {
  IconActivity,
  IconBell,
  IconBook,
  IconCalendar,
  IconChartLine,
  IconCreditCard,
  IconLayoutDashboard,
  IconMessagePlus,
  IconNews,
  IconPalette,
  IconPlus,
  IconPuzzle,
  IconSettings,
  IconShield,
  IconWallet,
  type Icon,
} from '@tabler/icons-react';

export type CommandGroup = 'navigation' | 'create' | 'plugins' | 'settings';

export interface CommandItem {
  id: string;
  group: CommandGroup;
  label: string;
  /** Search aliases — extra terms the user can type to surface this command. */
  keywords?: string[];
  icon: Icon;
  /**
   * Where to navigate. When `kind === 'navigate'`, the palette
   * pushes the path with router.push(). The component handles this.
   */
  href?: string;
  /**
   * Custom handler. When set, the palette calls this instead of
   * navigating. Use for actions like "create new chat" that need
   * imperative behavior.
   */
  action?: () => void;
  /**
   * Optional keyboard hint shown on the right side of the row.
   */
  shortcut?: string;
}

export const COMMANDS: readonly CommandItem[] = [
  // ── Navigation ───────────────────────────────────────────
  {
    id: 'nav-dashboard',
    group: 'navigation',
    label: 'Dashboard',
    icon: IconLayoutDashboard,
    href: '/dashboard',
    keywords: ['home', 'overview', 'widgets', 'briefing'],
  },
  {
    id: 'nav-chat',
    group: 'navigation',
    label: 'AI Research Chat',
    icon: IconMessagePlus,
    href: '/chat',
  },
  {
    id: 'nav-chart-xau',
    group: 'navigation',
    label: 'Chart — Gold (XAUUSD)',
    icon: IconChartLine,
    href: '/chart/XAUUSD',
    keywords: ['xau', 'gold', 'xauusd'],
  },
  {
    id: 'nav-chart-eur',
    group: 'navigation',
    label: 'Chart — Euro (EURUSD)',
    icon: IconChartLine,
    href: '/chart/EURUSD',
    keywords: ['eur', 'euro', 'eurusd'],
  },
  {
    id: 'nav-chart-gbp',
    group: 'navigation',
    label: 'Chart — Pound (GBPUSD)',
    icon: IconChartLine,
    href: '/chart/GBPUSD',
    keywords: ['gbp', 'pound', 'cable'],
  },
  { id: 'nav-news', group: 'navigation', label: 'News', icon: IconNews, href: '/news' },
  {
    id: 'nav-calendar',
    group: 'navigation',
    label: 'Economic Calendar',
    icon: IconCalendar,
    href: '/calendar',
  },
  { id: 'nav-alerts', group: 'navigation', label: 'Price Alerts', icon: IconBell, href: '/alerts' },
  {
    id: 'nav-journal',
    group: 'navigation',
    label: 'Trade Journal',
    icon: IconBook,
    href: '/journal',
  },
  {
    id: 'nav-settings',
    group: 'navigation',
    label: 'Settings',
    icon: IconSettings,
    href: '/settings',
  },

  // ── Create ────────────────────────────────────────────────
  { id: 'create-chat', group: 'create', label: 'New chat', icon: IconPlus, shortcut: 'C' },

  // ── Settings deep links ───────────────────────────────────
  {
    id: 'set-billing',
    group: 'settings',
    label: 'Subscription & Billing',
    icon: IconCreditCard,
    href: '/settings/billing',
    keywords: ['plan', 'upgrade', 'billing', 'subscription'],
  },
  {
    id: 'set-plugins',
    group: 'settings',
    label: 'Plugin Store',
    icon: IconPuzzle,
    href: '/settings/plugins',
    keywords: ['plugins', 'install', 'extensions', 'backtesting', 'telegram', 'paper trading'],
  },
  {
    id: 'set-portfolio',
    group: 'settings',
    label: 'Portfolio & Risk Rules',
    icon: IconWallet,
    href: '/settings/portfolio',
    keywords: ['risk', 'drawdown', 'equity', 'positions'],
  },
  {
    id: 'set-symbols',
    group: 'settings',
    label: 'Watchlist Symbols',
    icon: IconSettings,
    href: '/settings/symbols',
    keywords: ['watchlist', 'forex', 'gold', 'pairs'],
  },
  {
    id: 'set-notifications',
    group: 'settings',
    label: 'Notifications & Telegram',
    icon: IconBell,
    href: '/settings/notifications',
    keywords: ['alert', 'push', 'email', 'telegram'],
  },
  {
    id: 'set-profile',
    group: 'settings',
    label: 'Profile & Security',
    icon: IconShield,
    href: '/settings/profile',
    keywords: ['password', '2fa', 'account', 'security'],
  },
  {
    id: 'set-appearance',
    group: 'settings',
    label: 'Appearance & Data',
    icon: IconPalette,
    href: '/settings/appearance',
    keywords: ['theme', 'dark', 'light', 'export'],
  },
  {
    id: 'set-usage',
    group: 'settings',
    label: 'Activity & Quota',
    icon: IconActivity,
    href: '/settings/usage',
    keywords: ['usage', 'quota', 'activity'],
  },
];

/**
 * Find a command by id. Returns null when not found.
 */
export function findCommand(id: string): CommandItem | null {
  return COMMANDS.find((c) => c.id === id) ?? null;
}
