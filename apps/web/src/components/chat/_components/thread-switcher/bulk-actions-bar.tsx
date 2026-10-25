'use client';

// SPDX-License-Identifier: Apache-2.0

// Sticky bulk-action toolbar shown in bulk-select mode.
import { IconLoader2, IconTrash } from '@tabler/icons-react';

interface BulkActionsBarProps {
  selectedCount: number;
  deleting: boolean;
  onCancel: () => void;
  onDelete: () => void;
}

export function BulkActionsBar({
  selectedCount,
  deleting,
  onCancel,
  onDelete,
}: BulkActionsBarProps) {
  return (
    <div
      role="toolbar"
      aria-label="Bulk actions"
      className="border-border bg-bg-elev-1 sticky bottom-0 flex items-center justify-between gap-2 border-t p-3"
    >
      <span className="text-fg-muted text-caption">{selectedCount} selected</span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="text-fg-muted hover:text-fg border-border/60 hover:bg-bg-elev-2 text-caption inline-flex h-10 items-center rounded-sm border px-3 font-medium"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onDelete}
          disabled={selectedCount === 0 || deleting}
          aria-label={`Delete ${selectedCount} selected conversation${selectedCount === 1 ? '' : 's'}`}
          className="text-danger border-danger/40 hover:bg-danger/15 text-caption inline-flex h-10 items-center gap-1.5 rounded-sm border px-3 font-semibold disabled:cursor-not-allowed disabled:opacity-50"
        >
          {deleting ? (
            <IconLoader2 className="size-3 animate-spin" aria-hidden="true" />
          ) : (
            <IconTrash className="size-3.5" aria-hidden="true" />
          )}
          Delete selected ({selectedCount})
        </button>
      </div>
    </div>
  );
}
