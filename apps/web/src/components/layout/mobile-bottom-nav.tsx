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

// Phone bottom bar: the four workspace destinations a trader flips between all
// day, plus the way into everything else. Labels are prose (Funnel Sans), the
// active item is marked by a brand rail on top — no fake status dot, and no
// "HUD" jargon for what is simply the navigation menu.
import { IconDots } from '@tabler/icons-react';
import { m } from 'motion/react';
import { Link } from 'next-view-transitions';
import { usePathname } from 'next/navigation';

import { MOTION_PRESETS } from '@/components/ui/motion-config';
import { cn } from '@/lib/formatters/cn';

import { useNavDrawer } from './nav-drawer-context';
import { isNavItemActive, PRIMARY_NAV_ITEMS } from './nav-items';
import { useShellRoute } from './shell-route-context';

const BOTTOM_ITEMS = PRIMARY_NAV_ITEMS.filter((item) =>
  ['/chat', '/dashboard', '/journal', '/alerts'].includes(item.href),
);

export function MobileBottomNav() {
  const pathname = usePathname() ?? '';
  const { isChat } = useShellRoute();
  const { setOpen } = useNavDrawer();

  // Hide on /chat routes so the full-screen sticky chat composer keeps its
  // vertical space.
  if (isChat) {
    return null;
  }

  return (
    <nav
      aria-label="Mobile primary navigation"
      className="pb-safe px-safe bg-bg/95 fixed inset-x-0 bottom-0 z-30 flex h-[calc(3.5rem+env(safe-area-inset-bottom,0px))] items-center justify-around border-t border-white/[0.08] shadow-[0_-8px_30px_rgba(0,0,0,0.8)] backdrop-blur-xl select-none lg:hidden"
    >
      {BOTTOM_ITEMS.map((item) => {
        const active = isNavItemActive(item, pathname);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            prefetch={true}
            aria-label={item.label}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'relative flex min-h-[44px] min-w-[56px] flex-1 flex-col items-center justify-center gap-1 rounded-lg py-1 transition-colors select-none active:translate-y-[0.5px]',
              active ? 'text-brand' : 'text-fg-subtle hover:text-fg',
            )}
          >
            {active && (
              <m.span
                layoutId="bottom-nav-active-pill"
                aria-hidden="true"
                className="bg-brand absolute top-0.5 h-0.5 w-7 rounded-full shadow-[0_0_10px_rgba(255,54,22,0.9)]"
                transition={MOTION_PRESETS.layout}
              />
            )}
            <Icon className="size-5 shrink-0" strokeWidth={active ? 2 : 1.75} aria-hidden="true" />
            <span
              className={cn(
                'truncate font-sans text-[11px] leading-none',
                active ? 'font-medium' : 'font-normal',
              )}
            >
              {item.label}
            </span>
          </Link>
        );
      })}

      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open navigation menu"
        className="text-fg-subtle hover:text-fg relative flex min-h-[44px] min-w-[56px] flex-1 flex-col items-center justify-center gap-1 rounded-lg py-1 font-sans text-[11px] transition-colors active:translate-y-[0.5px]"
      >
        <IconDots className="size-5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
        <span className="truncate leading-none">More</span>
      </button>
    </nav>
  );
}
