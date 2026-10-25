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

  return (
    <aside
      aria-label="Desktop navigation sidebar"
      className={cn(
        'fixed top-0 bottom-0 left-0 z-40 hidden flex-col justify-between lg:flex',
        'bg-card border-r border-white/[0.08] transition-all duration-200 select-none',
        collapsed ? 'w-16' : 'w-56',
      )}
      style={{
        paddingTop: 'max(env(safe-area-inset-top), 12px)',
        paddingBottom: 'max(env(safe-area-inset-bottom), 12px)',
      }}
    >
      {/* Top Header / Brand */}
      <div className="flex flex-col gap-4 px-2">
        <div className="flex h-10 items-center justify-between px-2 pt-1">
          <KestrelBrand
            variant={collapsed ? 'mark' : 'lockup'}
            markSize="sm"
            href="/dashboard"
            className="overflow-hidden"
          />
          <button
            type="button"
            onClick={toggleCollapsed}
            className="text-fg-subtle hover:text-fg hover:bg-bg-elev-2 rounded-md p-1 transition-colors active:translate-y-[0.5px]"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? (
              <IconChevronRight className="size-4" />
            ) : (
              <IconChevronLeft className="size-4" />
            )}
          </button>
        </div>

        {/* New Thread CTA Button */}
        <Link
          href="/chat?new=1"
          prefetch={true}
          aria-label="New thread"
          className={cn(
            'border-chip-edge group text-fg relative flex items-center justify-center gap-2 rounded-[10px] border px-3 py-2 font-mono text-xs font-medium shadow-(--shadow-chip) transition-all',
            'from-brand/20 via-brand/10 hover:border-brand/50 bg-gradient-to-r to-transparent active:translate-y-[0.5px]',
            collapsed ? 'mx-auto size-10 p-0' : 'w-full',
          )}
          title={collapsed ? 'New thread' : undefined}
        >
          <IconPlus className="text-brand size-4" />
          {!collapsed && <span>New thread</span>}
        </Link>

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
