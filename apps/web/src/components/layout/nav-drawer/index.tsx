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

// <NavDrawer> — left-side slide-in nav for phones and tablets. Single global
// instance, controlled via <NavDrawerProvider>.
//
// It is the same navigation as the desktop rail: brand, new-thesis action, the
// workspace rows, plugins, preferences, then the market strip and identity
// pinned at the bottom — so the user keeps one mental model across devices.
import { IconX } from '@tabler/icons-react';
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
import { NewThesisButton } from '../new-thesis-button';
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
        <DrawerPrimitive.Overlay className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm" />
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
          <DrawerPrimitive.Description className="sr-only">
            Workspace sections, plugins, preferences, market status, and account actions.
          </DrawerPrimitive.Description>

          <div className="flex items-center justify-between px-4 pt-4 pb-3">
            <KestrelBrand variant="lockup" href="/dashboard" />
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close navigation"
              className="text-fg-subtle hover:text-fg inline-flex size-9 items-center justify-center rounded-lg transition-colors hover:bg-white/[0.06] active:translate-y-[0.5px]"
            >
              <IconX className="size-4.5" aria-hidden="true" />
            </button>
          </div>

          <div className="px-3 pb-1">
            <NewThesisButton />
          </div>

          <NavDrawerSections
            pathname={pathname ?? ''}
            isAdmin={isAdmin}
            installedPluginIds={installedPluginIds}
          />

          <NavDrawerFooter
            userName={userName}
            userEmail={userEmail}
            initial={initial}
            onLogout={() => void logout()}
          />
        </DrawerPrimitive.Content>
      </DrawerPrimitive.Portal>
    </DrawerPrimitive.Root>
  );
}
