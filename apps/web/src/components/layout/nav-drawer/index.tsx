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
import { IconPlus } from '@tabler/icons-react';
import { signOut } from 'next-auth/react';
import { Link } from 'next-view-transitions';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo } from 'react';
import { toast } from 'sonner';
import { Drawer as DrawerPrimitive } from 'vaul';

import { KestrelBrand } from '@/components/brand/kestrel-brand';
import { cn } from '@/lib/formatters/cn';
import { clearKestrelClientState } from '@/lib/http/cache-isolation';

import '@/lib/plugins/register-ui';

import { SidebarTelemetry } from '../desktop-sidebar/sidebar-telemetry';
import { useNavDrawer } from '../nav-drawer-context';
import { NavDrawerFooter } from './nav-drawer-footer';
import { NavDrawerSections } from './nav-drawer-sections';

export function NavDrawer({
  userName,
  userEmail,
  userId: _userId,
  isAdmin,
  installedPluginIds = [],
}: {
  userName?: string;
  userEmail?: string;
  userId?: string;
  isAdmin?: boolean;
  installedPluginIds?: readonly string[];
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
        <DrawerPrimitive.Overlay className="bg-black/80 backdrop-blur-sm fixed inset-0 z-[60]" />
        <DrawerPrimitive.Content
          id="sidebar-nav"
          aria-label="Primary navigation"
          className={cn(
            'bg-bg/98 text-fg fixed inset-y-0 left-0 z-[60] flex w-[88vw] max-w-[340px] flex-col',
            'border-r border-white/[0.08] shadow-[20px_0_50px_rgba(0,0,0,0.85)] backdrop-blur-2xl',
            'paint-isolated select-none',
            'focus-visible:outline-none',
          )}
          style={{
            paddingTop: 'env(safe-area-inset-top)',
            paddingBottom: 'env(safe-area-inset-bottom)',
            // Landscape: keep the sheet clear of the Dynamic Island / notch.
            paddingLeft: 'env(safe-area-inset-left)',
          }}
        >
          <DrawerPrimitive.Title className="sr-only">Primary navigation</DrawerPrimitive.Title>
          <div
            aria-hidden="true"
            className="bg-fg-subtle/30 absolute top-1/2 right-2 h-12 w-1 -translate-y-1/2 rounded-full"
          />

          {/* Brand & HUD Badge Header */}
          <div className="flex items-center justify-between px-5 pt-5 pb-2">
            <KestrelBrand variant="lockup" href="/dashboard" className="w-28" />
            <span className="flex items-center gap-1.5 rounded border border-brand/25 bg-brand/10 px-1.5 py-0.5 font-mono text-[9px] font-bold text-brand uppercase tracking-wider">
              <span className="size-1.5 rounded-full bg-bull animate-pulse shadow-[0_0_6px_rgba(63,158,61,0.7)]" />
              HUD v2.4
            </span>
          </div>

          {/* Tactical NEW THESIS Button */}
          <div className="px-4 py-1.5">
            <Link
              href="/chat?new=1"
              prefetch={true}
              onClick={() => setOpen(false)}
              aria-label="New thesis"
              className={cn(
                'group relative flex items-center justify-between rounded-lg border font-mono text-xs font-semibold transition-all select-none',
                'border-brand/45 bg-gradient-to-r from-brand/20 via-brand/10 to-transparent hover:border-brand hover:from-brand/30 hover:shadow-[0_0_18px_rgba(255,54,22,0.25)]',
                'active:scale-[0.98] active:translate-y-[0.5px] p-2.5 px-3.5 text-fg',
              )}
            >
              <div className="flex items-center gap-2">
                <IconPlus className="text-brand size-4 shrink-0 transition-transform duration-200 group-hover:rotate-90" />
                <span className="tracking-wide">NEW THESIS</span>
              </div>
              <kbd className="rounded bg-brand/15 border border-brand/30 px-1.5 py-0.5 font-mono text-[9px] font-bold text-brand">
                ⌘N
              </kbd>
            </Link>
          </div>

          {/* Operator Station Identity Strip */}
          <div className="mx-4 my-1.5 rounded-lg border border-white/[0.06] bg-black/40 p-2.5">
            <div className="flex items-center justify-between pb-1.5 font-mono text-[9px] text-fg-subtle tracking-wider uppercase">
              <span>// OPERATOR STATION</span>
              <span className="flex items-center gap-1 font-semibold text-bull text-[8px]">
                <span className="size-1.5 rounded-full bg-bull animate-pulse shadow-[0_0_6px_rgba(63,158,61,0.7)]" />
                ONLINE
              </span>
            </div>
            <div className="flex items-center gap-3 pt-0.5">
              <div className="surface-chip bg-bg-elev-2 text-fg border-border/80 relative flex size-9 shrink-0 items-center justify-center rounded-lg border font-mono text-sm font-bold shadow-sm">
                <span>{initial}</span>
                <span className="absolute -right-0.5 -bottom-0.5 flex size-2.5 items-center justify-center">
                  <span className="bg-bull absolute inline-flex h-full w-full animate-ping rounded-full opacity-60" />
                  <span className="bg-bull ring-card relative inline-flex size-2 rounded-full ring-2" />
                </span>
              </div>
              <div className="flex min-w-0 flex-col gap-0.5">
                <div className="flex items-center gap-1.5">
                  <span className="text-fg truncate text-sm font-semibold tracking-tight">
                    {userName ?? 'Kestrel Trader'}
                  </span>
                  <span className="rounded bg-brand/10 border border-brand/25 px-1 py-0.2 font-mono text-[8px] font-bold text-brand uppercase tracking-wider">
                    BYOK
                  </span>
                </div>
                <span className="text-fg-subtle truncate font-mono text-xs">
                  {userEmail ?? 'operator@kestrel'}
                </span>
              </div>
            </div>
          </div>

          <DrawerPrimitive.Description className="sr-only">
            Navigate between dashboard, chat, chart, news, calendar, alerts, journal, and settings.
          </DrawerPrimitive.Description>

          <NavDrawerSections
            pathname={pathname ?? ''}
            isAdmin={isAdmin}
            installedPluginIds={installedPluginIds}
          />

          {/* Live Session Telemetry Bar */}
          <div className="px-4 py-2 border-t border-white/[0.06]">
            <SidebarTelemetry collapsed={false} />
          </div>

          {/* Footer */}
          <NavDrawerFooter onLogout={() => void logout()} />
        </DrawerPrimitive.Content>
      </DrawerPrimitive.Portal>
    </DrawerPrimitive.Root>
  );
}
