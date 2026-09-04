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

import { getUserWithSettings } from '@kestrel/db';
import { redirect } from 'next/navigation';
import { cache, Suspense } from 'react';

import { auth } from '@/auth';
import { AppShellContainer } from '@/components/layout/app-shell-container';
import { DesktopSidebar } from '@/components/layout/desktop-sidebar';
import { CommandPalette, InstallNudge } from '@/components/layout/lazy-chrome';
import { MarketSessionBar } from '@/components/layout/market-session-bar';
import { NavDrawer } from '@/components/layout/nav-drawer';
import { NavDrawerProvider } from '@/components/layout/nav-drawer-context';
import { OfflineBanner } from '@/components/layout/offline-banner';
import { SidebarStateProvider } from '@/components/layout/sidebar-state-context';
import { SkipToContent } from '@/components/layout/skip-to-content';
import { TickerTape } from '@/components/layout/ticker-tape';
import { TopBar } from '@/components/layout/top-bar';
import { MotionRoot } from '@/components/ui/motion-config';
import { Toaster } from '@/components/ui/toaster';
import { checkIsAdmin } from '@/lib/admin-check';

const getOnboardingStatus = cache(async (userId: string) => {
  const { settings } = await getUserWithSettings(userId);
  return settings?.onboardingCompleted ?? false;
});

/**
 * Mobile-first & Desktop-adaptive shell shared by all authenticated pages.
 *
 *   1. <NavDrawerProvider/>   single source of truth for the menu state
 *   2. <DesktopSidebar/>      persistent sidebar rail on desktop (lg:+)
 *   3. <SkipToContent/>       a11y skip link, visible on focus only
 *   4. <TopBar/>              sticky top — hidden on /chat where
 *                              <ChatTopBar/> takes over
 *   5. <TickerTape/> + <MarketSessionBar/> ambient market telemetry
 *   6. main content           page body (id="main-content")
 *   7. <NavDrawer/>           drawer instance for mobile/touch
 *   8. <OfflineBanner/>       sticky network-state pill
 *   9. <Toaster/>             bottom-center sonner
 */
export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  let userName: string | undefined;
  let userEmail: string | undefined;
  let userId: string | undefined;
  let isAdmin = false;

  if (process.env.AUTH_MODE !== 'legacy') {
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
        const [onboarding, admin] = await Promise.all([
          getOnboardingStatus(session.user.id),
          checkIsAdmin(),
        ]);
        onboardingCompleted = onboarding;
        isAdmin = admin;
      } catch (err) {
        console.error('[AppLayout] Failed to load onboarding status or admin status:', err);
      }
      if (!onboardingCompleted) {
        redirect('/onboarding');
      }
    }
  }

  return (
    <MotionRoot>
      <SidebarStateProvider>
        <NavDrawerProvider>
          <div className="bg-bg text-fg relative min-h-svh">
            <DesktopSidebar
              {...(userName !== undefined ? { userName } : {})}
              {...(userEmail !== undefined ? { userEmail } : {})}
              isAdmin={isAdmin}
            />
            <AppShellContainer>
              <SkipToContent />
              <TopBar />
              <TickerTape />
              <MarketSessionBar />
              <main
                id="main-content"
                tabIndex={-1}
                className="mx-auto w-full max-w-2xl px-4 pt-4 focus:outline-none md:max-w-4xl lg:max-w-5xl xl:max-w-7xl xl:px-6"
                style={{
                  viewTransitionName: 'main-content',
                  paddingBottom: 'calc(env(safe-area-inset-bottom) + 24px)',
                }}
              >
                {/* Phase B — UX_UPGRADE_PLAN.md item 12. PWA install hint. */}
                <InstallNudge />
                {/* H1: Suspense boundary for route-level streaming. */}
                <Suspense
                  fallback={
                    <div className="flex min-h-[40svh] items-center justify-center">
                      <div className="shimmer h-32 w-full max-w-md rounded-sm" />
                    </div>
                  }
                >
                  {children}
                </Suspense>
              </main>
            </AppShellContainer>
            <NavDrawer
              {...(userName !== undefined ? { userName } : {})}
              {...(userEmail !== undefined ? { userEmail } : {})}
              {...(userId !== undefined ? { userId } : {})}
              isAdmin={isAdmin}
            />
            <OfflineBanner />
            {/* Phase B — UX_UPGRADE_PLAN.md item 11. Global ⌘K / Ctrl-K
              launcher. Self-contained: keyboard listener, vaul drawer,
              floating touch button. */}
            <CommandPalette />
            <Toaster />
          </div>
        </NavDrawerProvider>
      </SidebarStateProvider>
    </MotionRoot>
  );
}
