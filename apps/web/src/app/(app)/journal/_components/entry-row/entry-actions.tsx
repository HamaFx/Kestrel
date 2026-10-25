'use client';

// SPDX-License-Identifier: Apache-2.0

// Row action controls: close position, replay setup, and delete.
import type { JournalEntry } from '@kestrel/shared';
import { IconHistory, IconTrash } from '@tabler/icons-react';

import { Button } from '@/components/ui/button';
import { Tooltip } from '@/components/ui/tooltip';

interface EntryActionsProps {
  entry: JournalEntry;
  closing: boolean;
  busy: boolean;
  onStartClose: () => void;
  onReplay: () => void;
  onDelete: () => void;
}

export function EntryActions({
  entry,
  closing,
  busy,
  onStartClose,
  onReplay,
  onDelete,
}: EntryActionsProps) {
  return (
    <div className="flex items-center gap-1">
      {entry.outcome === 'open' && !closing && (
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={onStartClose}
          className="cursor-pointer rounded-lg active:translate-y-[0.5px]"
        >
          Close...
        </Button>
      )}

      {/* Replay Setup Button */}
      <Tooltip label="Replay Setup">
        <button
          type="button"
          aria-label="Replay setup"
          onClick={onReplay}
          className="surface-chip inline-flex size-9 cursor-pointer items-center justify-center rounded-lg border border-white/10 text-sky-400/80 transition-all hover:border-white/20 hover:bg-sky-500/10 hover:text-sky-400 active:translate-y-[0.5px]"
        >
          <IconHistory className="size-4" />
        </button>
      </Tooltip>

      <Tooltip label="Delete Log">
        <button
          type="button"
          aria-label="Delete entry"
          onClick={onDelete}
          disabled={busy}
          className="surface-chip hover:border-bear/30 text-bear/75 hover:text-bear hover:bg-bear/10 inline-flex size-9 cursor-pointer items-center justify-center rounded-lg border border-white/10 transition-all active:translate-y-[0.5px] disabled:opacity-50"
        >
          <IconTrash className="size-4" />
        </button>
      </Tooltip>
    </div>
  );
}
