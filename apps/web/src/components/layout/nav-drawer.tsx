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

// <NavDrawer> — left-side slide-in nav. Single global instance, controlled
// via <NavDrawerProvider> context. See nav-drawer-context.tsx for the
// rationale.
import { IconLogout } from '@tabler/icons-react';
import { signOut } from 'next-auth/react';
import { Link } from 'next-view-transitions';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo } from 'react';
import { toast } from 'sonner';
import { Drawer as DrawerPrimitive } from 'vaul';

import { KestrelBrand } from '@/components/brand/kestrel-brand';
import { clearKestrelClientState } from '@/lib/cache-isolation';
import { cn } from '@/lib/cn';

import { useNavDrawer } from './nav-drawer-context';
import {
  ADMIN_NAV_ITEMS,
  isNavItemActive,
  PRIMARY_NAV_ITEMS,
  SECONDARY_NAV_ITEMS,
  type NavItem,
} from './nav-items';

export function NavDrawer({
  userName,
  userEmail,
  userId: _userId,
  isAdmin,
}: {
  userName?: string;
  userEmail?: string;
  userId?: string;
  isAdmin?: boolean;
}) {
  const { open, setOpen } = useNavDrawer();
  const pathname = usePathname();

  useEffect(() => {
    setOpen(false);
  }, [pathname, setOpen]);

  async function logout() {
    try {
      await clearKestrelClientState();
      await signOut({ callbackUrl: '/login', redirect: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to log out. Please try again.');
    }
  }

  const initial = useMemo(() => userName?.charAt(0)?.toUpperCase() || 'K', [userName]);

  return (
    <DrawerPrimitive.Root open={open} onOpenChange={setOpen} direction="left">
      <DrawerPrimitive.Portal>
        <DrawerPrimitive.Overlay className="bg-overlay fixed inset-0 z-[60]" />
        <DrawerPrimitive.Content
          id="sidebar-nav"
          aria-label="Primary navigation"
          className={cn(
            'surface-elevated fixed inset-y-0 left-0 z-[60] flex w-[88vw] max-w-[340px] flex-col',
            'border-border rounded-sm border-r',
            'paint-isolated',
            'focus-visible:outline-none',
          )}
          style={{
            paddingTop: 'env(safe-area-inset-top)',
            paddingBottom: 'env(safe-area-inset-bottom)',
          }}
        >
          <DrawerPrimitive.Title className="sr-only">Primary navigation</DrawerPrimitive.Title>
          <div
            aria-hidden="true"
            className="bg-fg-subtle/30 absolute top-1/2 right-2 h-12 w-1 -translate-y-1/2 rounded-sm"
          />

          {/* Brand */}
          <div className="flex items-center px-5 pt-6 pb-3">
            <KestrelBrand variant="lockup" href="/dashboard" className="w-32" />
          </div>

          {/* Identity strip */}
          <div className="flex items-center gap-3 px-5 pt-6 pb-5">
            <div className="bg-bg-elev-2 text-fg flex size-11 items-center justify-center rounded-sm text-sm font-bold">
              <span className="text-lg font-bold">{initial}</span>
            </div>
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="text-fg truncate text-base font-bold tracking-tight">
                {userName ?? 'Kestrel Trader'}
              </span>
              <span className="text-fg-subtle truncate text-xs">
                {userEmail ?? 'AI Market Copilot'}
              </span>
            </div>
          </div>

          <DrawerPrimitive.Description className="sr-only">
            Navigate between dashboard, chat, chart, news, calendar, alerts, journal, and settings.
          </DrawerPrimitive.Description>

          <nav aria-label="Primary" className="scrollbar-hide flex-1 overflow-y-auto px-3 pb-4">
            <Section label="Navigation">
              {PRIMARY_NAV_ITEMS.map((item) => (
                <NavLink
                  key={item.href}
                  item={item}
                  active={isNavItemActive(item, pathname ?? '')}
                />
              ))}
            </Section>

            <Section label="Preferences">
              {SECONDARY_NAV_ITEMS.map((item) => (
                <NavLink
                  key={item.href}
                  item={item}
                  active={isNavItemActive(item, pathname ?? '')}
                />
              ))}
            </Section>

            {isAdmin ? (
              <Section label="Administration">
                {ADMIN_NAV_ITEMS.map((item) => (
                  <NavLink
                    key={item.href}
                    item={item}
                    active={isNavItemActive(item, pathname ?? '')}
                  />
                ))}
              </Section>
            ) : null}
          </nav>

          {/* Footer */}
          <div className="border-border mt-auto border-t px-3 py-3">
            <button
              type="button"
              onClick={() => void logout()}
              className="text-fg-muted hover:text-fg hover:bg-bg-elev-2 focus-visible:ring-brand flex min-h-[48px] w-full items-center gap-3 rounded-sm px-3 text-left text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none"
            >
              <span
                aria-hidden="true"
                className="text-fg-muted bg-bg-elev-3 inline-flex size-9 items-center justify-center rounded-sm"
              >
                <IconLogout className="size-4" strokeWidth={2} />
              </span>
              Sign out
            </button>
          </div>
        </DrawerPrimitive.Content>
      </DrawerPrimitive.Portal>
    </DrawerPrimitive.Root>
  );
}

// ---------------------------------------------------------------------------

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 pt-3 first:pt-0">
      <p className="text-fg-subtle px-3 pb-1 text-xs font-semibold tracking-wider uppercase">
        {label}
      </p>
      <ul className="flex flex-col gap-0.5">{children}</ul>
    </div>
  );
}

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <li>
      <Link
        href={item.href}
        prefetch={true}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'group/nav focus-visible:ring-brand relative flex min-h-[56px] items-center gap-3 rounded-md px-3 transition-all focus-visible:ring-2 focus-visible:outline-none',
          active
            ? 'bg-bg-elev-2 text-fg surface-chip border-brand/40 shadow-sm'
            : 'text-fg-muted hover:bg-bg-elev-2/50 hover:text-fg border border-transparent',
        )}
      >
        {active && (
          <span
            aria-hidden="true"
            className="bg-brand absolute left-1 h-3.5 w-1 rounded-full shadow-[0_0_8px_rgba(255,54,22,0.6)]"
          />
        )}
        <span
          aria-hidden="true"
          className={cn(
            'inline-flex size-9 items-center justify-center rounded-sm transition-colors',
            active
              ? 'bg-bg-elev-3 text-brand'
              : 'bg-bg-elev-2 text-fg-muted group-hover/nav:text-fg',
          )}
        >
          <Icon className="size-5" strokeWidth={active ? 2 : 1.75} />
        </span>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="text-sm leading-tight font-semibold">{item.label}</span>
          {item.description ? (
            <span className="text-fg-subtle truncate text-xs leading-tight">
              {item.description}
            </span>
          ) : null}
        </div>
      </Link>
    </li>
  );
}
