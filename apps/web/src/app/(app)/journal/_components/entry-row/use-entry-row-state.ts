// SPDX-License-Identifier: Apache-2.0

// Interaction state for a single journal row: inline close form, replay
// drawer, busy/error flags, and the close/delete mutations.
import type { JournalEntry } from '@kestrel/shared';
import { useState } from 'react';

import type { useConfirm } from '@/components/ui/confirm-drawer';

import { deleteJournalEntryAction, updateJournalEntryAction } from '../../actions';

type ConfirmFn = ReturnType<typeof useConfirm>[1];

interface UseEntryRowStateArgs {
  entry: JournalEntry;
  onClosed: () => void;
  onDeleted: () => void;
  confirm: ConfirmFn;
}

export function useEntryRowState({ entry, onClosed, onDeleted, confirm }: UseEntryRowStateArgs) {
  const [closing, setClosing] = useState(false);
  const [replayOpen, setReplayOpen] = useState(false);
  const [exit, setExit] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function close() {
    setBusy(true);
    setError(null);
    const exitNum = Number(exit);
    if (!Number.isFinite(exitNum)) {
      setBusy(false);
      setError('Exit must be a number');
      return;
    }
    try {
      const res = await updateJournalEntryAction(entry.id, {
        exit: exitNum,
        closedAt: Date.now(),
      });
      if (!res.ok) {
        throw new Error(res.error ?? 'close failed');
      }
      setClosing(false);
      setExit('');
      onClosed();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'close failed');
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    const ok = await confirm({
      title: 'Delete this entry?',
      description: `${entry.symbol} ${entry.side} @ ${entry.entry} will be permanently removed.`,
      confirmLabel: 'Delete',
      tone: 'danger',
    });
    if (!ok) return;
    setBusy(true);
    try {
      const res = await deleteJournalEntryAction(entry.id);
      if (!res.ok) {
        throw new Error(res.error ?? 'delete failed');
      }
      onDeleted();
    } catch {
      // Handled cleanly
    } finally {
      setBusy(false);
    }
  }

  function cancelClose() {
    setClosing(false);
    setExit('');
    setError(null);
  }

  return {
    closing,
    setClosing,
    replayOpen,
    setReplayOpen,
    exit,
    setExit,
    busy,
    error,
    close,
    remove,
    cancelClose,
  };
}
