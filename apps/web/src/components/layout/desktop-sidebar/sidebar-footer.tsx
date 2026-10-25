'use client';

// SPDX-License-Identifier: Apache-2.0

// Bottom footer of the desktop sidebar: admin/settings links, profile chip
// and the sign-out button.
import { IconLogout, IconSettings, IconShield } from '@tabler/icons-react';
import { Link } from 'next-view-transitions';

import { cn } from '@/lib/formatters/cn';

export function SidebarFooter({
  collapsed,
  pathname,
  isAdmin,
  userName,
  userEmail,
  initial,
  onLogout,
}: {
  collapsed: boolean;
  pathname: string;
  isAdmin?: boolean;
  userName?: string;
  userEmail?: string;
  initial: string;
  onLogout: () => void;
}) {
  return (
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
              className="bg-brand absolute left-1 h-3.5 w-1 rounded-full shadow-[0_0_8px_rgba(255,54,22,0.6)]"
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
            className="bg-brand absolute left-1 h-3.5 w-1 rounded-full shadow-[0_0_8px_rgba(255,54,22,0.6)]"
          />
        )}
        <IconSettings
          className={cn(
            'size-5 shrink-0',
            pathname.startsWith('/settings') ? 'text-brand' : 'text-fg-subtle group-hover:text-fg',
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
              <span className="text-fg truncate font-sans text-xs font-medium">
                {userName || 'Trader'}
              </span>
              <span className="text-fg-subtle text-caption truncate font-mono">
                {userEmail || ''}
              </span>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={onLogout}
          className="text-fg-subtle hover:text-danger rounded-md p-1 transition-colors active:translate-y-[0.5px]"
          title="Sign out"
          aria-label="Sign out"
        >
          <IconLogout className="size-4" />
        </button>
      </div>
    </div>
  );
}
