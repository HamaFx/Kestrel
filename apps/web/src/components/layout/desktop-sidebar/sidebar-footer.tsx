'use client';

// SPDX-License-Identifier: Apache-2.0

// Bottom of the desktop rail: Settings (and Admin for operators), then the
// signed-in identity with sign-out.
//
// Ordered the way the shell rules ask — scope (market, above), preferences,
// then identity last — so the rows never move as the workspace grows. The
// identity line states who is signed in; it does not need a fake "ONLINE"
// pulse to do so.
import { IconLogout } from '@tabler/icons-react';
import { Link } from 'next-view-transitions';

import { Tooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/formatters/cn';

import { ADMIN_NAV_ITEMS, isNavItemActive, SECONDARY_NAV_ITEMS } from '../nav-items';
import { NavRow, NavSection } from '../nav-row';

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
  const footerItems = [...SECONDARY_NAV_ITEMS, ...(isAdmin ? ADMIN_NAV_ITEMS : [])];

  const avatar = (
    <span className="surface-chip bg-bg-elev-2 text-fg border-border/80 flex size-8 shrink-0 items-center justify-center rounded-lg border font-sans text-xs font-semibold">
      {initial}
    </span>
  );

  return (
    <div className="border-border/60 flex flex-col gap-1 border-t px-2 pt-2">
      {collapsed ? (
        <span className="border-border/60 mx-2 mb-1 block border-t" aria-hidden="true" />
      ) : null}

      <NavSection label={collapsed ? undefined : 'Preferences'}>
        {footerItems.map((item) => (
          <NavRow
            key={item.href}
            href={item.href}
            label={item.label}
            icon={item.icon}
            active={isNavItemActive(item, pathname)}
            collapsed={collapsed}
          />
        ))}
      </NavSection>

      <div
        className={cn(
          'mt-1 flex items-center gap-2 rounded-lg p-1',
          collapsed && 'flex-col gap-1.5 p-0',
        )}
      >
        <Link
          href="/settings"
          prefetch={true}
          aria-label="Account settings"
          className="group flex min-w-0 flex-1 items-center gap-2.5 overflow-hidden rounded-lg px-1 py-0.5 transition-colors hover:bg-white/[0.04]"
        >
          {collapsed ? (
            <Tooltip
              label={`${userName ?? 'Trader'} · Account`}
              side="right"
              className="w-full justify-center"
            >
              {avatar}
            </Tooltip>
          ) : (
            avatar
          )}

          {!collapsed ? (
            <span className="flex min-w-0 flex-col">
              <span className="flex items-center gap-1.5">
                <span className="text-fg truncate font-sans text-xs font-medium tracking-tight">
                  {userName ?? 'Trader'}
                </span>
                <span className="border-border/70 text-fg-subtle shrink-0 rounded border px-1 py-px font-mono text-[9px] tracking-wider uppercase">
                  BYOK
                </span>
              </span>
              <span className="text-fg-subtle truncate font-sans text-[11px]">
                {userEmail ?? 'operator@kestrel'}
              </span>
            </span>
          ) : null}
        </Link>

        {collapsed ? (
          <Tooltip label="Sign out" side="right" className="w-full justify-center">
            <button
              type="button"
              onClick={onLogout}
              aria-label="Sign out"
              className="text-fg-subtle hover:bg-danger/10 hover:text-danger rounded-md p-1.5 transition-colors active:translate-y-[0.5px]"
            >
              <IconLogout className="size-4" aria-hidden="true" />
            </button>
          </Tooltip>
        ) : (
          <Tooltip label="Sign out" side="top">
            <button
              type="button"
              onClick={onLogout}
              aria-label="Sign out"
              className="text-fg-subtle hover:bg-danger/10 hover:text-danger rounded-md p-1.5 transition-colors active:translate-y-[0.5px]"
            >
              <IconLogout className="size-4" aria-hidden="true" />
            </button>
          </Tooltip>
        )}
      </div>
    </div>
  );
}
