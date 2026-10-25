'use client';

// SPDX-License-Identifier: Apache-2.0

// TanStack Router-style dropdown for the conversation-level actions.
import { IconDots, IconFileDownload, IconMessages, IconTrash } from '@tabler/icons-react';

import { usePopupMenu } from '@/hooks/use-popup-menu';

interface ChatOverflowMenuProps {
  onSwitchConversation: () => void;
  onExport: () => void;
  onDelete: () => void;
}

export function ChatOverflowMenu({
  onSwitchConversation,
  onExport,
  onDelete,
}: ChatOverflowMenuProps) {
  const overflowMenu = usePopupMenu();

  return (
    <div className="relative" ref={overflowMenu.menuRef}>
      <button
        ref={overflowMenu.triggerRef}
        type="button"
        onClick={() => overflowMenu.setOpen((v) => !v)}
        aria-label="Conversation menu"
        {...overflowMenu.triggerProps}
        className="text-fg-muted hover:text-fg hover:bg-bg-elev-2 active:bg-bg-elev-3 inline-flex size-9 shrink-0 items-center justify-center rounded-lg transition-colors"
      >
        <IconDots className="size-4" />
      </button>
      {overflowMenu.open ? (
        <div
          {...overflowMenu.menuProps}
          className="surface-elevated text-body-sm border-border absolute top-11 right-0 z-50 w-56 overflow-hidden rounded-lg border shadow-lg"
        >
          <button
            role="menuitem"
            type="button"
            onClick={() => {
              overflowMenu.setOpen(false);
              onSwitchConversation();
            }}
            className="text-fg hover:bg-bg-elev-2 flex min-h-[44px] w-full items-center gap-2 px-3.5 py-2.5 text-left text-xs font-medium"
          >
            <IconMessages className="size-4" />
            Switch conversation
          </button>
          <div className="border-border/60 border-t" />
          <button
            role="menuitem"
            type="button"
            onClick={() => {
              overflowMenu.setOpen(false);
              onExport();
            }}
            className="text-fg hover:bg-bg-elev-2 flex min-h-[44px] w-full items-center gap-2 px-3.5 py-2.5 text-left text-xs font-medium"
          >
            <IconFileDownload className="size-4" />
            Export as Markdown
          </button>
          <div className="border-border/60 border-t" />
          <button
            role="menuitem"
            type="button"
            onClick={() => {
              overflowMenu.setOpen(false);
              onDelete();
            }}
            className="text-danger hover:bg-danger/10 flex min-h-[44px] w-full items-center gap-2 px-3.5 py-2.5 text-left text-xs font-medium"
          >
            <IconTrash className="size-4" />
            Delete conversation
          </button>
        </div>
      ) : null}
    </div>
  );
}
