'use client';

// SPDX-License-Identifier: Apache-2.0

// Bottom footer of the desktop sidebar: admin/settings links, profile chip
// and the sign-out button.
import { IconLogout, IconSettings, IconShield } from '@tabler/icons-react';
import { m } from 'motion/react';
import { Link } from 'next-view-transitions';

import { MOTION_PRESETS } from '@/components/ui/motion-config';
import { Tooltip } from '@/components/ui/tooltip';
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
  const isAdminActive = pathname.startsWith('/admin');
  const isSettingsActive = pathname.startsWith('/settings');

  const adminLink = (
    <Link
      href="/admin"
      prefetch={true}
      aria-label="Admin"
      aria-current={isAdminActive ? 'page' : undefined}
      className={cn(
        'group relative flex items-center rounded-lg px-2.5 py-2 text-sm font-medium transition-colors select-none active:translate-y-[0.5px]',
        collapsed ? 'mx-auto size-10 justify-center p-0' : 'gap-3',
        isAdminActive
          ? 'text-fg font-semibold'
          : 'text-fg-muted hover:text-fg hover:bg-white/[0.04]',
      )}
    >
      {isAdminActive && (
        <>
          <m.span
            layoutId="sidebar-active-bg"
            aria-hidden="true"
            className="bg-bg-elev-2/90 border-brand/35 pointer-events-none absolute inset-0 rounded-lg border shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06),0_2px_8px_rgba(0,0,0,0.3)]"
            transition={MOTION_PRESETS.layout}
          />
          <m.span
            layoutId="sidebar-active-pill"
            aria-hidden="true"
            className={cn(
              'bg-brand pointer-events-none absolute rounded-full shadow-[0_0_10px_rgba(255,54,22,0.7)]',
              collapsed ? 'left-1 top-2.5 bottom-2.5 w-1' : 'left-1.5 h-4 w-1',
            )}
            transition={MOTION_PRESETS.layout}
          />
        </>
      )}
      <IconShield
        className={cn(
          'size-5 shrink-0 transition-colors z-10',
          isAdminActive ? 'text-brand' : 'text-fg-subtle group-hover:text-fg',
          isAdminActive && !collapsed && 'ml-0.5',
        )}
        strokeWidth={isAdminActive ? 2 : 1.75}
        aria-hidden="true"
      />
      {!collapsed && (
        <span className="z-10 truncate font-sans text-[13px] tracking-tight">Admin</span>
      )}
    </Link>
  );

  const settingsLink = (
    <Link
      href="/settings"
      prefetch={true}
      aria-label="Settings"
      aria-current={isSettingsActive ? 'page' : undefined}
      className={cn(
        'group relative flex items-center rounded-lg px-2.5 py-2 text-sm font-medium transition-colors select-none active:translate-y-[0.5px]',
        collapsed ? 'mx-auto size-10 justify-center p-0' : 'gap-3',
        isSettingsActive
          ? 'text-fg font-semibold'
          : 'text-fg-muted hover:text-fg hover:bg-white/[0.04]',
      )}
    >
      {isSettingsActive && (
        <>
          <m.span
            layoutId="sidebar-active-bg"
            aria-hidden="true"
            className="bg-bg-elev-2/90 border-brand/35 pointer-events-none absolute inset-0 rounded-lg border shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06),0_2px_8px_rgba(0,0,0,0.3)]"
            transition={MOTION_PRESETS.layout}
          />
          <m.span
            layoutId="sidebar-active-pill"
            aria-hidden="true"
            className={cn(
              'bg-brand pointer-events-none absolute rounded-full shadow-[0_0_10px_rgba(255,54,22,0.7)]',
              collapsed ? 'left-1 top-2.5 bottom-2.5 w-1' : 'left-1.5 h-4 w-1',
            )}
            transition={MOTION_PRESETS.layout}
          />
        </>
      )}
      <IconSettings
        className={cn(
          'size-5 shrink-0 transition-colors z-10',
          isSettingsActive ? 'text-brand' : 'text-fg-subtle group-hover:text-fg',
          isSettingsActive && !collapsed && 'ml-0.5',
        )}
        strokeWidth={isSettingsActive ? 2 : 1.75}
        aria-hidden="true"
      />
      {!collapsed && (
        <span className="z-10 truncate font-sans text-[13px] tracking-tight">Settings</span>
      )}
      {!collapsed && (
        <kbd
          aria-hidden="true"
          className={cn(
            'text-fg-subtle/70 bg-white/[0.04] border-white/[0.06] z-10 ml-auto rounded border px-1.5 py-0.5 font-mono text-[9px] font-normal tracking-wider transition-opacity',
            isSettingsActive ? 'opacity-90' : 'opacity-0 group-hover:opacity-100',
          )}
        >
          ⌘,
        </kbd>
      )}
    </Link>
  );

  const profileAvatar = (
    <div className="surface-chip bg-bg-elev-2 text-fg border-border/80 relative flex size-8 shrink-0 items-center justify-center rounded-lg border font-mono text-xs font-bold shadow-sm transition-transform active:scale-95">
      {initial}
      {/* Live connected status ping */}
      <span className="absolute -right-0.5 -bottom-0.5 flex size-2.5 items-center justify-center">
        <span className="bg-bull absolute inline-flex h-full w-full animate-ping rounded-full opacity-60" />
        <span className="bg-bull ring-card relative inline-flex size-2 rounded-full ring-2" />
      </span>
    </div>
  );

  const logoutButton = (
    <button
      type="button"
      onClick={onLogout}
      className="text-fg-subtle hover:text-danger hover:bg-danger/10 rounded-md p-1.5 transition-all active:scale-95 active:translate-y-[0.5px]"
      title="Sign out"
      aria-label="Sign out"
    >
      <IconLogout className="size-4" />
    </button>
  );

  return (
    <div className="border-border/60 flex flex-col gap-1 border-t px-2 pt-2">
      {/* Operator Station Pill Header */}
      {!collapsed && (
        <div className="mb-0.5 flex items-center justify-between px-2 pt-1 font-mono text-[9px] text-fg-subtle tracking-wider uppercase">
          <span className="text-fg-subtle/70">// OPERATOR STATION</span>
          <span className="flex items-center gap-1 font-semibold text-bull text-[8px]">
            <span className="size-1.5 rounded-full bg-bull animate-pulse shadow-[0_0_6px_rgba(0,230,118,0.8)]" />
            LIVE // 24ms
          </span>
        </div>
      )}

      {isAdmin &&
        (collapsed ? (
          <Tooltip label="06 // Admin" side="right" className="w-full justify-center">
            {adminLink}
          </Tooltip>
        ) : (
          adminLink
        ))}

      {collapsed ? (
        <Tooltip label="07 // Settings" side="right" shortcut="⌘," className="w-full justify-center">
          {settingsLink}
        </Tooltip>
      ) : (
        settingsLink
      )}

      {/* User profile & Logout */}
      <div
        className={cn(
          'mt-1 flex items-center justify-between rounded-lg p-1.5 transition-colors border border-white/[0.04] bg-black/30',
          collapsed ? 'flex-col gap-2 border-0 bg-transparent p-0' : 'gap-2 hover:border-white/[0.1] hover:bg-black/50',
        )}
      >
        <Link
          href="/settings"
          prefetch={true}
          className="group flex min-w-0 items-center gap-2.5 overflow-hidden"
          aria-label="View profile settings"
        >
          {collapsed ? (
            <Tooltip
              label={`${userName || 'Trader'} (Connected)`}
              side="right"
              className="w-full justify-center"
            >
              {profileAvatar}
            </Tooltip>
          ) : (
            profileAvatar
          )}

          {!collapsed && (
            <div className="flex min-w-0 flex-col">
              <div className="flex items-center gap-1.5">
                <span className="text-fg group-hover:text-brand truncate font-sans text-xs font-semibold tracking-tight transition-colors">
                  {userName || 'Trader'}
                </span>
                <span className="rounded bg-brand/10 border border-brand/25 px-1 py-0.2 font-mono text-[8px] font-bold text-brand uppercase tracking-wider">
                  BYOK
                </span>
              </div>
              <span className="text-fg-subtle text-caption truncate font-mono text-[10px]">
                {userEmail || 'operator@kestrel'}
              </span>
            </div>
          )}
        </Link>

        {collapsed ? (
          <Tooltip label="Sign out" side="right" className="w-full justify-center">
            {logoutButton}
          </Tooltip>
        ) : (
          logoutButton
        )}
      </div>
    </div>
  );
}
