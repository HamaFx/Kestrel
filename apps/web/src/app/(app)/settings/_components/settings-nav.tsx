'use client';

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
  IconActivity,
  IconArrowLeft,
  IconBell,
  IconChevronRight,
  IconCpu,
  IconCreditCard,
  IconDatabase,
  IconKey,
  IconList,
  IconMessageCircle,
  IconPalette,
  IconRobot,
  IconSettings,
  IconShield,
  IconUser,
  IconWallet,
} from '@tabler/icons-react';
import { Link } from 'next-view-transitions';
import { usePathname } from 'next/navigation';

import { cn } from '@/lib/cn';

const NAV_ITEMS = [
  { href: '/settings', label: 'General', icon: IconSettings, exact: true },
  { href: '/settings/profile', label: 'Profile', icon: IconUser },
  { href: '/settings/api-keys', label: 'API Keys', icon: IconKey },
  { href: '/settings/models', label: 'Models', icon: IconCpu },
  { href: '/settings/agent', label: 'Agent', icon: IconRobot },
  { href: '/settings/symbols', label: 'Symbols', icon: IconList },
  { href: '/settings/security', label: 'Security', icon: IconShield },
  { href: '/settings/notifications', label: 'Notifications', icon: IconBell },
  { href: '/settings/appearance', label: 'Appearance', icon: IconPalette },
  { href: '/settings/data', label: 'Data', icon: IconDatabase },
  { href: '/settings/usage', label: 'Usage', icon: IconActivity },
  { href: '/settings/portfolio', label: 'Portfolio', icon: IconWallet },
  { href: '/settings/telegram', label: 'Telegram', icon: IconMessageCircle },
  { href: '/settings/billing', label: 'Billing', icon: IconCreditCard },
];

export function SettingsNav() {
  const pathname = usePathname();
  const isSubPage = pathname !== '/settings';

  const currentItem = NAV_ITEMS.find((item) =>
    item.exact ? pathname === item.href : pathname?.startsWith(item.href),
  );

  return (
    <div className="flex shrink-0 flex-col gap-3 md:w-56">
      {isSubPage && (
        <nav aria-label="Breadcrumb" className="text-fg-subtle flex items-center gap-1.5 text-sm">
          <Link
            href="/settings"
            className="hover:text-fg inline-flex shrink-0 items-center gap-1.5 transition-colors"
          >
            <IconArrowLeft className="size-3.5" />
            Settings
          </Link>
          {currentItem && (
            <>
              <IconChevronRight className="size-3.5 shrink-0" aria-hidden />
              <span className="text-fg truncate font-medium" aria-current="page">
                {currentItem.label}
              </span>
            </>
          )}
        </nav>
      )}

      <aside className="w-full">
        <nav
          aria-label="Settings"
          className="flex snap-x flex-row gap-1 overflow-x-auto pb-2 md:flex-col md:pb-0"
        >
          {NAV_ITEMS.map((item) => {
            const active = item.exact ? pathname === item.href : pathname?.startsWith(item.href);

            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex snap-start min-h-10 items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium whitespace-nowrap transition-colors tactile-press active:translate-y-[0.5px]',
                  active
                    ? 'bg-brand/8 ring-brand/22 text-brand ring-1'
                    : 'text-fg-subtle hover:bg-bg-elev-2 hover:text-fg',
                )}
              >
                <Icon className="size-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>
    </div>
  );
}
