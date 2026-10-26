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

// <DesktopSidebar> — fixed lg+ rail: brand, new-thesis action, workspace +
// plugin navigation, market strip, then preferences and identity pinned to the
// bottom. Every row is the shared <NavRow>; see nav-row.tsx for the contract.
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react';
import { signOut } from 'next-auth/react';
import { usePathname } from 'next/navigation';
import { toast } from 'sonner';

import { KestrelBrand } from '@/components/brand/kestrel-brand';
import { Tooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/formatters/cn';

import '@/lib/plugins/register-ui';

import { NewThesisButton } from '../new-thesis-button';
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

  return (
    <aside
      aria-label="Desktop navigation sidebar"
      className={cn(
        'bg-bg/95 fixed top-0 bottom-0 left-0 z-40 hidden flex-col justify-between backdrop-blur-xl select-none lg:flex',
        'border-r border-white/[0.08] shadow-[1px_0_20px_rgba(0,0,0,0.5)] transition-[width] duration-200 ease-in-out',
        collapsed ? 'w-16' : 'w-56',
      )}
      style={{
        paddingTop: 'max(env(safe-area-inset-top), 12px)',
        paddingBottom: 'max(env(safe-area-inset-bottom), 12px)',
      }}
    >
      {/* Brand + collapse control */}
      <div className="flex flex-col gap-3 px-2">
        <div
          className={cn(
            'flex items-center px-1 pt-1',
            collapsed ? 'flex-col gap-1' : 'justify-between',
          )}
        >
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
              className="text-fg-subtle hover:text-brand hover:bg-brand/10 hover:border-brand/30 rounded-md border border-transparent p-1.5 transition-colors active:translate-y-[0.5px]"
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              aria-expanded={!collapsed}
            >
              {collapsed ? (
                <IconChevronRight className="size-4" aria-hidden="true" />
              ) : (
                <IconChevronLeft className="size-4" aria-hidden="true" />
              )}
            </button>
          </Tooltip>
        </div>

        <NewThesisButton collapsed={collapsed} />

        <SidebarNavGroups
          collapsed={collapsed}
          pathname={pathname}
          installedPluginIds={installedPluginIds}
        />
      </div>

      {/* Ambient market state, preferences, identity */}
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
