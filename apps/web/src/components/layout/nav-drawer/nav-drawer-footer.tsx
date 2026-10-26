'use client';

// SPDX-License-Identifier: Apache-2.0

// Drawer footer with the sign-out action.
import { IconLogout } from '@tabler/icons-react';

export function NavDrawerFooter({ onLogout }: { onLogout: () => void }) {
  return (
    <div className="mt-auto border-t border-white/[0.08] bg-black/30 px-4 py-3">
      <button
        type="button"
        onClick={onLogout}
        className="group relative flex min-h-[44px] w-full items-center justify-between rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 font-mono text-xs font-semibold text-fg-muted transition-all hover:border-danger/40 hover:bg-danger/10 hover:text-danger active:scale-[0.98] select-none"
      >
        <div className="flex items-center gap-2.5">
          <span
            aria-hidden="true"
            className="inline-flex size-7 items-center justify-center rounded-md border border-white/[0.06] bg-white/[0.04] text-fg-subtle group-hover:border-danger/30 group-hover:text-danger transition-colors"
          >
            <IconLogout className="size-3.5" strokeWidth={2} />
          </span>
          <span>DISCONNECT SESSION</span>
        </div>
        <span className="font-mono text-[9px] text-fg-subtle/50 group-hover:text-danger/70">
          ESC
        </span>
      </button>
    </div>
  );
}
