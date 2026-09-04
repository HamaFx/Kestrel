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
import {
  IconBell,
  IconBook,
  IconCalendar,
  IconChartLine,
  IconChevronLeft,
  IconChevronRight,
  IconLayoutDashboard,
  IconLogout,
  IconMessageCircle,
  IconNews,
  IconPlus,
  IconSettings,
  IconShield,
  IconWorld,
} from '@tabler/icons-react';
import { signOut } from 'next-auth/react';
import { Link } from 'next-view-transitions';
import { usePathname } from 'next/navigation';
import { toast } from 'sonner';

import { KestrelBrand } from '@/components/brand/kestrel-brand';
import { cn } from '@/lib/cn';

import { HangingPendant } from './hanging-pendant';
import { useSidebarState } from './sidebar-state-context';

interface NavItem {
  href: string;
  label: string;
  icon: typeof IconMessageCircle;
  match?: readonly string[];
}

const PRIMARY_ITEMS: readonly NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: IconLayoutDashboard },
  { href: '/chat', label: 'Chat', icon: IconMessageCircle },
  { href: '/chart/XAUUSD', label: 'Chart', icon: IconChartLine, match: ['/chart'] },
  { href: '/news', label: 'News', icon: IconNews },
  { href: '/calendar', label: 'Calendar', icon: IconCalendar },
  { href: '/alerts', label: 'Alerts', icon: IconBell },
  { href: '/journal', label: 'Journal', icon: IconBook },
];

export function DesktopSidebar({
  userName,
  userEmail,
  isAdmin,
}: {
  userName?: string;
  userEmail?: string;
  isAdmin?: boolean;
}) {
  const { collapsed, toggle: toggleCollapsed } = useSidebarState();
  const pathname = usePathname() ?? '';

  function isActive(item: NavItem): boolean {
    const candidates = item.match ?? [item.href];
    return candidates.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  }

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
        'border-border/80 bg-bg-elev-1 surface-well-deep border-r transition-all duration-200 select-none shadow-[inset_-1px_0_0_rgba(255,255,255,0.05)]',
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
            href="/landing"
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
          href="/chat"
          prefetch={true}
          aria-label="New thread"
          className={cn(
            'border-chip-edge group relative flex items-center justify-center gap-2 rounded-[10px] border px-3 py-2 text-xs font-mono font-medium text-fg shadow-(--shadow-chip) transition-all',
            'bg-gradient-to-r from-brand/20 via-brand/10 to-transparent hover:border-brand/50 active:translate-y-[0.5px]',
            collapsed ? 'mx-auto size-10 p-0' : 'w-full',
          )}
          title={collapsed ? 'New thread' : undefined}
        >
          <IconPlus className="text-brand size-4" />
          {!collapsed && <span>New thread</span>}
        </Link>

        {/* Primary Nav List */}
        <nav className="flex flex-col gap-1" aria-label="Main Navigation">
          {PRIMARY_ITEMS.map((item) => {
            const active = isActive(item);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                prefetch={true}
                aria-label={item.label}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'group relative flex items-center gap-3 rounded-md px-2.5 py-2 text-sm font-medium transition-all active:translate-y-[0.5px]',
                  active
                    ? 'bg-bg-elev-2 text-fg surface-chip border-brand/40 shadow-sm'
                    : 'text-fg-muted hover:text-fg hover:bg-bg-elev-2/50 border border-transparent',
                )}
                title={collapsed ? item.label : undefined}
              >
                {active && (
                  <span
                    aria-hidden="true"
                    className="absolute left-1 h-3.5 w-1 rounded-full bg-brand shadow-[0_0_8px_rgba(255,54,22,0.6)]"
                  />
                )}
                <Icon
                  className={cn(
                    'size-5 shrink-0 transition-colors',
                    active ? 'text-brand' : 'text-fg-subtle group-hover:text-fg',
                    active && 'ml-1',
                  )}
                  aria-hidden="true"
                />
                {!collapsed && (
                  <span className={cn('truncate font-sans', active && 'font-medium')}>
                    {item.label}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Interactive Verlet Physics Pendant */}
        {!collapsed && (
          <div className="flex justify-center py-1 opacity-75 transition-opacity hover:opacity-100">
            <HangingPendant />
          </div>
        )}
      </div>

      {/* Bottom Footer Items */}
      <div className="border-border/60 flex flex-col gap-1 border-t px-2 pt-3">
        {isAdmin && (
          <Link
            href="/admin"
            prefetch={true}
            aria-label="Admin"
            aria-current={pathname.startsWith('/admin') ? 'page' : undefined}
            className={cn(
              'group relative flex items-center gap-3 rounded-md px-2.5 py-2 text-sm font-medium transition-all active:translate-y-[0.5px]',
              pathname.startsWith('/admin')
                ? 'bg-bg-elev-2 text-fg surface-chip border-brand/40 shadow-sm'
                : 'text-fg-muted hover:text-fg hover:bg-bg-elev-2/50 border border-transparent',
            )}
            title={collapsed ? 'Admin' : undefined}
          >
            {pathname.startsWith('/admin') && (
              <span
                aria-hidden="true"
                className="absolute left-1 h-3.5 w-1 rounded-full bg-brand shadow-[0_0_8px_rgba(255,54,22,0.6)]"
              />
            )}
            <IconShield
              className={cn(
                'size-5 shrink-0',
                pathname.startsWith('/admin') ? 'text-brand' : 'text-fg-subtle group-hover:text-fg',
                pathname.startsWith('/admin') && 'ml-1',
              )}
              aria-hidden="true"
            />
            {!collapsed && <span className="truncate font-sans">Admin</span>}
          </Link>
        )}

        <Link
          href="/landing"
          prefetch={true}
          aria-label="Showcase"
          className={cn(
            'group relative flex items-center gap-3 rounded-md px-2.5 py-2 text-sm font-medium transition-all active:translate-y-[0.5px]',
            'text-fg-muted hover:text-fg hover:bg-bg-elev-2/50 border border-transparent',
          )}
          title={collapsed ? 'Showcase' : undefined}
        >
          <IconWorld
            className="size-5 shrink-0 text-fg-subtle group-hover:text-brand transition-colors"
            aria-hidden="true"
          />
          {!collapsed && <span className="truncate font-sans">Showcase</span>}
        </Link>

        <Link
          href="/settings"
          prefetch={true}
          aria-label="Settings"
          aria-current={pathname.startsWith('/settings') ? 'page' : undefined}
          className={cn(
            'group relative flex items-center gap-3 rounded-md px-2.5 py-2 text-sm font-medium transition-all active:translate-y-[0.5px]',
            pathname.startsWith('/settings')
              ? 'bg-bg-elev-2 text-fg surface-chip border-brand/40 shadow-sm'
              : 'text-fg-muted hover:text-fg hover:bg-bg-elev-2/50 border border-transparent',
          )}
          title={collapsed ? 'Settings' : undefined}
        >
          {pathname.startsWith('/settings') && (
            <span
              aria-hidden="true"
              className="absolute left-1 h-3.5 w-1 rounded-full bg-brand shadow-[0_0_8px_rgba(255,54,22,0.6)]"
            />
          )}
          <IconSettings
            className={cn(
              'size-5 shrink-0',
              pathname.startsWith('/settings')
                ? 'text-brand'
                : 'text-fg-subtle group-hover:text-fg',
              pathname.startsWith('/settings') && 'ml-1',
            )}
            aria-hidden="true"
          />
          {!collapsed && <span className="truncate font-sans">Settings</span>}
        </Link>

        {/* User profile & Logout */}
        <div className="mt-1 flex items-center justify-between gap-2 px-2 py-2">
          <div className="flex min-w-0 items-center gap-2">
            <div className="surface-chip bg-bg-elev-2 text-fg border-border flex size-7 shrink-0 items-center justify-center rounded-md border font-mono text-xs font-bold shadow-sm">
              {initial}
            </div>
            {!collapsed && (
              <div className="flex min-w-0 flex-col">
                <span className="text-fg truncate text-xs font-medium font-sans">
                  {userName || 'Trader'}
                </span>
                <span className="text-fg-subtle text-caption truncate font-mono">{userEmail || ''}</span>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={handleLogout}
            className="text-fg-subtle hover:text-danger rounded-md p-1 transition-colors active:translate-y-[0.5px]"
            title="Sign out"
            aria-label="Sign out"
          >
            <IconLogout className="size-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
