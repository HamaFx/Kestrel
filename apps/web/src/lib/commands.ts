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
  IconCpu,
  IconKey,
  IconLayoutDashboard,
  IconMessagePlus,
  IconNews,
  IconPlus,
  IconPuzzle,
  IconSettings,
  IconSparkles,
  IconUser,
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
    label: 'Overview',
    icon: IconLayoutDashboard,
    href: '/dashboard',
    keywords: ['home', 'dashboard', 'overview', 'widgets', 'briefing'],
  },
  {
    id: 'nav-chat',
    group: 'navigation',
    label: 'Research Chat',
    icon: IconMessagePlus,
    href: '/chat',
    keywords: ['ai', 'chat', 'research', 'analysis'],
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
  {
    id: 'nav-news',
    group: 'navigation',
    label: 'News & Macro',
    icon: IconNews,
    href: '/news',
    keywords: ['news', 'headlines', 'market'],
  },
  {
    id: 'nav-calendar',
    group: 'navigation',
    label: 'Economic Calendar',
    icon: IconCalendar,
    href: '/calendar',
    keywords: ['calendar', 'events', 'cpi', 'fomc', 'nfp'],
  },
  {
    id: 'nav-alerts',
    group: 'navigation',
    label: 'Price Alerts',
    icon: IconBell,
    href: '/alerts',
  },
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
  {
    id: 'create-chat',
    group: 'create',
    label: 'New analysis',
    icon: IconPlus,
    shortcut: '⌘J',
    keywords: ['new chat', 'new analysis', 'thread'],
  },

  // ── Settings deep links ───────────────────────────────────
  {
    id: 'set-profile',
    group: 'settings',
    label: 'Profile & Security',
    icon: IconUser,
    href: '/settings',
    keywords: ['password', '2fa', 'account', 'security', 'watchlist', 'theme'],
  },
  {
    id: 'set-api-keys',
    group: 'settings',
    label: 'AI API Keys (BYOK)',
    icon: IconKey,
    href: '/settings/api-keys',
    keywords: ['api key', 'byok', 'openai', 'anthropic', 'gemini', 'openrouter'],
  },
  {
    id: 'set-models',
    group: 'settings',
    label: 'AI Models & Routing',
    icon: IconCpu,
    href: '/settings/models',
    keywords: ['model', 'claude', 'gpt', 'gemini', 'routing'],
  },
  {
    id: 'set-agent',
    group: 'settings',
    label: 'AI Persona & Memory',
    icon: IconSparkles,
    href: '/settings/agent',
    keywords: ['persona', 'instructions', 'memory', 'agent'],
  },
  {
    id: 'set-plugins',
    group: 'settings',
    label: 'Extensions & Plugins',
    icon: IconPuzzle,
    href: '/settings/plugins',
    keywords: ['plugins', 'install', 'extensions', 'backtesting', 'telegram', 'paper trading'],
  },
  {
    id: 'set-usage',
    group: 'settings',
    label: 'Usage & Spend',
    icon: IconActivity,
    href: '/settings/usage',
    keywords: ['usage', 'quota', 'activity', 'cost', 'budget'],
  },
];

/**
 * Find a command by id. Returns null when not found.
 */
