'use client';

// SPDX-License-Identifier: Apache-2.0

// Drawer footer with the sign-out action.
import { IconLogout } from '@tabler/icons-react';

export function NavDrawerFooter({ onLogout }: { onLogout: () => void }) {
  return (
    <div className="border-border mt-auto border-t px-3 py-3">
      <button
        type="button"
        onClick={onLogout}
        className="text-fg-muted hover:text-fg hover:bg-bg-elev-2 focus-visible:ring-brand flex min-h-[48px] w-full items-center gap-3 rounded-sm px-3 text-left text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none"
      >
        <span
          aria-hidden="true"
          className="text-fg-muted bg-bg-elev-3 inline-flex size-9 items-center justify-center rounded-sm"
        >
          <IconLogout className="size-4" strokeWidth={2} />
        </span>
        Sign out
      </button>
    </div>
  );
}
