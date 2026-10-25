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

import {
  getInstalledPluginIdsForUser,
  getUserWithSettings,
  requireTenantIdForUser,
  withTenantDb,
} from '@kestrel/db';
import { redirect } from 'next/navigation';
import { cache, Suspense } from 'react';

import { auth } from '@/auth';
import { AppShellContainer, AppShellMain } from '@/components/layout/app-shell-container';
import { DesktopSidebar } from '@/components/layout/desktop-sidebar';
import { CommandPalette, InstallNudge } from '@/components/layout/lazy-chrome';
import { MarketSessionBar } from '@/components/layout/market-session-bar';
import { MobileBottomNav } from '@/components/layout/mobile-bottom-nav';
import { NavDrawer } from '@/components/layout/nav-drawer';
import { NavDrawerProvider } from '@/components/layout/nav-drawer-context';
import { OfflineBanner } from '@/components/layout/offline-banner';
import { ShellRouteProvider } from '@/components/layout/shell-route-context';
import { SidebarStateProvider } from '@/components/layout/sidebar-state-context';
import { SkipToContent } from '@/components/layout/skip-to-content';
import { TickerTape } from '@/components/layout/ticker-tape';
import { TopBar } from '@/components/layout/top-bar';
import { MotionRoot } from '@/components/ui/motion-config';
import { AmbientTelemetry } from '@/components/ui/segmented';
import { Toaster } from '@/components/ui/toaster';
import { checkIsAdmin } from '@/lib/auth/admin-check';

const getOnboardingStatus = cache(async (userId: string) => {
  const { settings } = await getUserWithSettings(userId);
  return settings?.onboardingCompleted ?? false;
});

/**
 * Installed plugins are a shell concern (sidebar / ⌘K / widgets), but a
 * plugin-table outage must never block the app shell. Fail open to core-only.
 */
const getInstalledPlugins = cache(async (userId: string): Promise<string[]> => {
  try {
    const tenantId = await requireTenantIdForUser(userId);
    return await withTenantDb(tenantId, () => getInstalledPluginIdsForUser(userId), { userId });
  } catch (err) {
    console.error('[AppLayout] Failed to load installed plugins:', err);
    return [];
  }
});

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  let userName: string | undefined;
  let userEmail: string | undefined;
  let userId: string | undefined;
  let isAdmin = false;
  let installedPluginIds: string[] = [];

  let session = null;
  try {
    session = await auth();
  } catch (err: unknown) {
    if ((err as { digest?: string })?.digest === 'DYNAMIC_SERVER_USAGE') {
      throw err;
    }
    console.error('[AppLayout] auth() session lookup failed:', err);
  }

  if (session?.user?.id) {
    userId = session.user.id;
    userName = session.user.name ?? undefined;
    userEmail = session.user.email ?? undefined;
    let onboardingCompleted = true;
    try {
      const [onboarding, admin, plugins] = await Promise.all([
        getOnboardingStatus(session.user.id),
        checkIsAdmin(),
        getInstalledPlugins(session.user.id),
      ]);
      onboardingCompleted = onboarding;
      isAdmin = admin;
      installedPluginIds = plugins;
    } catch (err) {
      console.error('[AppLayout] Failed to load onboarding status or admin status:', err);
    }
    if (!onboardingCompleted) {
      redirect('/onboarding');
    }
  }

  return (
    <MotionRoot>
      <SidebarStateProvider>
        <NavDrawerProvider>
          <ShellRouteProvider>
            <div className="bg-bg text-fg relative min-h-svh">
              <DesktopSidebar
                {...(userName !== undefined ? { userName } : {})}
                {...(userEmail !== undefined ? { userEmail } : {})}
                isAdmin={isAdmin}
                installedPluginIds={installedPluginIds}
              />
              <AppShellContainer>
                <SkipToContent />
                <TopBar />
                <AmbientTelemetry>
                  <TickerTape />
                  <MarketSessionBar />
                </AmbientTelemetry>
                <AppShellMain>
                  <InstallNudge />
                  <Suspense
                    fallback={
                      <div className="flex min-h-[40svh] items-center justify-center">
                        <div className="shimmer h-32 w-full max-w-md rounded-sm" />
                      </div>
                    }
                  >
                    {children}
                  </Suspense>
                </AppShellMain>
              </AppShellContainer>
              <MobileBottomNav />
              <NavDrawer
                {...(userName !== undefined ? { userName } : {})}
                {...(userEmail !== undefined ? { userEmail } : {})}
                {...(userId !== undefined ? { userId } : {})}
                isAdmin={isAdmin}
                installedPluginIds={installedPluginIds}
              />
              <OfflineBanner />
              <CommandPalette installedPluginIds={installedPluginIds} />
              <Toaster />
            </div>
          </ShellRouteProvider>
        </NavDrawerProvider>
      </SidebarStateProvider>
    </MotionRoot>
  );
}
