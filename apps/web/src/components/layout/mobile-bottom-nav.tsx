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
import { IconAdjustmentsHorizontal } from '@tabler/icons-react';
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

  // Hide on /chat routes so the full-screen sticky chat composer has maximum vertical space
  if (isChat) {
    return null;
  }

  return (
    <nav
      aria-label="Mobile primary navigation"
      className="pb-safe px-safe fixed inset-x-0 bottom-0 z-30 flex h-[calc(3.5rem+env(safe-area-inset-bottom,0px))] items-center justify-around border-t border-white/[0.08] bg-[#0b0c0f]/95 shadow-[0_-8px_30px_rgba(0,0,0,0.8)] backdrop-blur-xl select-none lg:hidden"
    >
      {BOTTOM_ITEMS.map((item) => {
        const active = isNavItemActive(item, pathname);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            prefetch={true}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'relative flex min-h-[44px] min-w-[56px] flex-1 flex-col items-center justify-center gap-0.5 rounded-lg py-1 font-mono text-[10px] transition-all select-none active:translate-y-[0.5px]',
              active
                ? 'bg-brand/[0.08] font-bold text-brand shadow-[inset_0_1px_0_0_rgba(255,54,22,0.2)]'
                : 'text-fg-subtle/80 hover:text-fg',
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
            <span className="truncate">{item.label}</span>
          </Link>
        );
      })}

      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open trading terminal HUD menu"
        className="text-fg-subtle/80 hover:text-brand relative flex min-h-[44px] min-w-[56px] flex-1 flex-col items-center justify-center gap-0.5 rounded-lg py-1 font-mono text-[10px] font-medium transition-colors active:translate-y-[0.5px]"
      >
        <span className="relative">
          <IconAdjustmentsHorizontal className="size-5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
          <span className="absolute -top-0.5 -right-0.5 size-1.5 rounded-full bg-bull shadow-[0_0_6px_rgba(0,230,118,0.8)]" />
        </span>
        <span>HUD</span>
      </button>
    </nav>
  );
}
