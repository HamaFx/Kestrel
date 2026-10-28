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
      className="surface-chip-dark tactile-press text-fg hover:border-brand/50 hover:text-brand focus-visible:ring-brand fixed right-4 z-30 inline-flex size-12 items-center justify-center rounded-xl border border-white/15 shadow-xl transition-colors focus-visible:ring-2 focus-visible:outline-none"
    >
      <IconCommand className="size-5" strokeWidth={1.85} aria-hidden="true" />
    </button>
  );
}
