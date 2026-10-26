'use client';

// SPDX-License-Identifier: Apache-2.0

// Drawer bottom: the market strip, then who is signed in and the way out.
// Identity sits in the footer here for the same reason it does on the desktop
// rail — the middle of the sheet belongs to navigation.
import { IconLogout } from '@tabler/icons-react';
import { Link } from 'next-view-transitions';

import { SidebarTelemetry } from '../desktop-sidebar/sidebar-telemetry';

export function NavDrawerFooter({
  userName,
  userEmail,
  initial,
  onLogout,
}: {
  userName?: string;
  userEmail?: string;
  initial: string;
  onLogout: () => void;
}) {
  return (
    <div className="border-t border-white/[0.08]">
      <div className="px-4 pt-3">
        <SidebarTelemetry collapsed={false} />
      </div>

      <div className="flex items-center gap-2.5 px-4 py-3">
        <Link
          href="/settings"
          prefetch={true}
          aria-label="Account settings"
          className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-1 py-1 transition-colors hover:bg-white/[0.04]"
        >
          <span className="surface-chip bg-bg-elev-2 text-fg border-border/80 flex size-8 shrink-0 items-center justify-center rounded-lg border font-sans text-xs font-semibold">
            {initial}
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="flex items-center gap-1.5">
              <span className="text-fg truncate font-sans text-xs font-medium tracking-tight">
                {userName ?? 'Kestrel Trader'}
              </span>
              <span className="border-border/70 text-fg-subtle shrink-0 rounded border px-1 py-px font-mono text-[9px] tracking-wider uppercase">
                BYOK
              </span>
            </span>
            <span className="text-fg-subtle truncate font-sans text-[11px]">
              {userEmail ?? 'operator@kestrel'}
            </span>
          </span>
        </Link>

        <button
          type="button"
          onClick={onLogout}
          aria-label="Sign out"
          className="text-fg-subtle hover:border-danger/40 hover:bg-danger/10 hover:text-danger flex min-h-11 shrink-0 items-center gap-2 rounded-lg border border-white/[0.06] px-3 font-sans text-xs transition-colors active:translate-y-[0.5px]"
        >
          <IconLogout className="size-4" aria-hidden="true" />
          Sign out
        </button>
      </div>
    </div>
  );
}
