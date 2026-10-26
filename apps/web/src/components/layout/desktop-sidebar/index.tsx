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
      aria-label="New thread"
      className={cn(
        'group text-fg relative flex items-center justify-center rounded-lg border font-mono text-xs font-medium transition-all select-none',
        'border-brand/30 bg-gradient-to-r from-brand/20 via-brand/10 to-transparent hover:border-brand/60 hover:from-brand/25 hover:via-brand/15 hover:shadow-[0_0_16px_rgba(255,54,22,0.2)]',
        'active:scale-[0.98] active:translate-y-[0.5px]',
        collapsed ? 'mx-auto size-10 p-0' : 'w-full gap-2 px-3 py-2',
      )}
    >
      <IconPlus className="text-brand size-4 shrink-0 transition-transform duration-200 group-hover:rotate-90" />
      {!collapsed && <span>New thread</span>}
    </Link>
  );

  return (
    <aside
      aria-label="Desktop navigation sidebar"
      className={cn(
        'fixed top-0 bottom-0 left-0 z-40 hidden flex-col justify-between lg:flex',
        'bg-card/95 backdrop-blur-md border-r border-white/[0.08] transition-[width] duration-200 ease-in-out select-none',
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
          <KestrelBrand
            variant={collapsed ? 'mark' : 'lockup'}
            markSize="sm"
            href="/dashboard"
            className="overflow-hidden"
          />
          <Tooltip
            label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            side={collapsed ? 'right' : 'top'}
            shortcut="⌘B"
          >
            <button
              type="button"
              onClick={toggleCollapsed}
              className="text-fg-subtle hover:text-fg hover:bg-white/[0.06] rounded-md p-1.5 transition-colors active:scale-95 active:translate-y-[0.5px]"
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

        {/* New Thread CTA Button */}
        {collapsed ? (
          <Tooltip label="New thread" side="right" className="w-full justify-center">
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

      {/* Bottom Footer Items */}
      <SidebarFooter
        collapsed={collapsed}
        pathname={pathname}
        isAdmin={isAdmin}
        userName={userName}
        userEmail={userEmail}
        initial={initial}
        onLogout={handleLogout}
      />
    </aside>
  );
}
