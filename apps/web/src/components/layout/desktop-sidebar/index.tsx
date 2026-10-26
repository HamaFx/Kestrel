// SPDX-License-Identifier: Apache-2.0

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

// <DesktopSidebar> — fixed lg+ sidebar shell: brand header, new-thread CTA,
// nav groups and footer. Groups live in sidebar-nav-groups/sidebar-footer.
import { IconChevronLeft, IconChevronRight, IconPlus } from '@tabler/icons-react';
import { signOut } from 'next-auth/react';
import { Link } from 'next-view-transitions';
import { usePathname } from 'next/navigation';
import { toast } from 'sonner';

import { KestrelBrand } from '@/components/brand/kestrel-brand';
import { Tooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/formatters/cn';

import '@/lib/plugins/register-ui';

import { useSidebarState } from '../sidebar-state-context';
import { SidebarFooter } from './sidebar-footer';
import { SidebarNavGroups } from './sidebar-nav-groups';
import { SidebarTelemetry } from './sidebar-telemetry';

export function DesktopSidebar({
  userName,
  userEmail,
  isAdmin,
  installedPluginIds = [],
}: {
  userName?: string;
  userEmail?: string;
  isAdmin?: boolean;
  installedPluginIds?: readonly string[];
}) {
  const { collapsed, toggle: toggleCollapsed } = useSidebarState();
  const pathname = usePathname() ?? '';

  async function handleLogout() {
    try {
      await signOut({ callbackUrl: '/login', redirect: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Logout failed');
    }
  }

  const initial = userName?.charAt(0)?.toUpperCase() || userEmail?.charAt(0)?.toUpperCase() || 'K';

  const newThreadButton = (
    <Link
      href="/chat?new=1"
      prefetch={true}
      aria-label="New thesis"
      className={cn(
        'group relative flex items-center justify-between rounded-lg border font-mono text-xs font-semibold transition-all select-none',
        'border-brand/45 bg-gradient-to-r from-brand/20 via-brand/10 to-transparent hover:border-brand hover:from-brand/30 hover:shadow-[0_0_18px_rgba(255,54,22,0.25)]',
        'active:scale-[0.98] active:translate-y-[0.5px]',
        collapsed ? 'mx-auto size-10 justify-center p-0' : 'w-full px-3 py-2 text-fg',
      )}
    >
      <div className="flex items-center gap-2">
        <IconPlus className="text-brand size-3.5 shrink-0 transition-transform duration-200 group-hover:rotate-90" />
        {!collapsed && <span className="tracking-wide">NEW THESIS</span>}
      </div>
      {!collapsed && (
        <kbd className="rounded bg-brand/15 border border-brand/30 px-1 py-0.5 font-mono text-[9px] font-bold text-brand">
          ⌘N
        </kbd>
      )}
    </Link>
  );

  return (
    <aside
      aria-label="Desktop navigation sidebar"
      className={cn(
        'fixed top-0 bottom-0 left-0 z-40 hidden flex-col justify-between lg:flex',
        'bg-[#0b0c0f]/95 backdrop-blur-xl border-r border-white/[0.08] shadow-[1px_0_20px_rgba(0,0,0,0.5)] transition-[width] duration-200 ease-in-out select-none',
        collapsed ? 'w-16' : 'w-56',
      )}
      style={{
        paddingTop: 'max(env(safe-area-inset-top), 12px)',
        paddingBottom: 'max(env(safe-area-inset-bottom), 12px)',
      }}
    >
      {/* Top Header / Brand */}
      <div className="flex flex-col gap-3 px-2">
        <div className="flex h-10 items-center justify-between px-2 pt-1">
          <div className="flex items-center gap-2 overflow-hidden">
            <KestrelBrand
              variant={collapsed ? 'mark' : 'lockup'}
              markSize="sm"
              href="/dashboard"
              className="overflow-hidden"
            />
            {!collapsed && (
              <span className="rounded bg-white/[0.04] border border-white/[0.08] px-1 py-0.5 font-mono text-[8px] font-bold tracking-widest text-fg-subtle uppercase">
                HUD
              </span>
            )}
          </div>
          <Tooltip
            label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            side={collapsed ? 'right' : 'top'}
            shortcut="⌘B"
          >
            <button
              type="button"
              onClick={toggleCollapsed}
              className="text-fg-subtle hover:text-brand hover:bg-brand/10 hover:border-brand/30 border border-transparent rounded-md p-1.5 transition-colors active:scale-95 active:translate-y-[0.5px]"
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              aria-expanded={!collapsed}
            >
              {collapsed ? (
                <IconChevronRight className="size-4" />
              ) : (
                <IconChevronLeft className="size-4" />
              )}
            </button>
          </Tooltip>
        </div>

        {/* Tactical New Thesis CTA Button */}
        {collapsed ? (
          <Tooltip label="New thesis" side="right" shortcut="⌘N" className="w-full justify-center">
            {newThreadButton}
          </Tooltip>
        ) : (
          newThreadButton
        )}

        <SidebarNavGroups
          collapsed={collapsed}
          pathname={pathname}
          installedPluginIds={installedPluginIds}
        />
      </div>

      {/* Mid/Bottom Telemetry & Operator Station Footer */}
      <div className="flex flex-col gap-2">
        <div className="px-2">
          <SidebarTelemetry collapsed={collapsed} />
        </div>

        <SidebarFooter
          collapsed={collapsed}
          pathname={pathname}
          isAdmin={isAdmin}
          userName={userName}
          userEmail={userEmail}
          initial={initial}
          onLogout={handleLogout}
        />
      </div>
    </aside>
  );
}
