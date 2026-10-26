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
import { IconMenu2 } from '@tabler/icons-react';
import { Link } from 'next-view-transitions';
import { usePathname } from 'next/navigation';

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
      className="border-border/80 bg-bg-elev-1 pb-safe px-safe fixed inset-x-0 bottom-0 z-30 flex h-[calc(3.5rem+env(safe-area-inset-bottom,0px))] items-center justify-around border-t lg:hidden"
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
              'flex min-h-[44px] min-w-[56px] flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors active:translate-y-[0.5px]',
              active ? 'text-brand font-semibold' : 'text-fg-subtle hover:text-fg',
            )}
          >
            <Icon className="size-5 shrink-0" strokeWidth={active ? 2 : 1.75} aria-hidden="true" />
            <span>{item.label}</span>
          </Link>
        );
      })}

      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open full navigation menu"
        className="text-fg-subtle hover:text-fg flex min-h-[44px] min-w-[56px] flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors active:translate-y-[0.5px]"
      >
        <IconMenu2 className="size-5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
        <span>More</span>
      </button>
    </nav>
  );
}
