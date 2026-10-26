'use client';

// SPDX-License-Identifier: Apache-2.0

// Floating ⌘K launcher for coarse-pointer (touch) devices. The palette shell
// only mounts this when the route is not `/chat`, where the launcher would
// collide with the sticky composer and the scroll-to-bottom FAB.
import { IconCommand } from '@tabler/icons-react';

export function CommandTouchLauncher({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label="Open command palette"
      style={{ bottom: 'calc(env(safe-area-inset-bottom) + 96px)' }}
      className="bg-bg-elev-2 text-fg-muted border-border hover:bg-bg-elev-3 hover:text-fg focus-visible:ring-brand fixed right-4 z-30 inline-flex size-12 items-center justify-center rounded-sm border shadow-md focus-visible:ring-2 focus-visible:outline-none"
    >
      <IconCommand className="size-5" aria-hidden="true" />
    </button>
  );
}
