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
import { signOut } from 'next-auth/react';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo } from 'react';
import { toast } from 'sonner';
import { Drawer as DrawerPrimitive } from 'vaul';

import { KestrelBrand } from '@/components/brand/kestrel-brand';
import { cn } from '@/lib/formatters/cn';
import { clearKestrelClientState } from '@/lib/http/cache-isolation';

import '@/lib/plugins/register-ui';

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
            // Landscape: keep the sheet clear of the Dynamic Island / notch.
            paddingLeft: 'env(safe-area-inset-left)',
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

          <NavDrawerSections
            pathname={pathname ?? ''}
            isAdmin={isAdmin}
            installedPluginIds={installedPluginIds}
          />

          {/* Footer */}
          <NavDrawerFooter onLogout={() => void logout()} />
        </DrawerPrimitive.Content>
      </DrawerPrimitive.Portal>
    </DrawerPrimitive.Root>
  );
}
