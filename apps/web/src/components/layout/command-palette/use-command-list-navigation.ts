// SPDX-License-Identifier: Apache-2.0
// Keeps the highlighted palette row in range and scrolled into view, and maps
// arrow/enter/escape keys on the search input to list navigation.

import { useEffect } from 'react';

import type { CommandItem } from '@/lib/commands';

import type { CommandRow } from './command-groups';

export function useCommandListNavigation({
  open,
  activeIdx,
  setActiveIdx,
  flatRows,
  runCommand,
  setOpen,
}: {
  open: boolean;
  activeIdx: number;
  setActiveIdx: React.Dispatch<React.SetStateAction<number>>;
  flatRows: readonly CommandRow[];
  runCommand: (cmd: CommandItem) => void;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  useEffect(() => {
    if (flatRows.length > 0 && activeIdx >= flatRows.length) {
      setActiveIdx(0);
    }
  }, [flatRows.length, activeIdx, setActiveIdx]);

  useEffect(() => {
    if (!open) return;
    const activeEl = document.querySelector(`[data-command-idx="${activeIdx}"]`);
    if (activeEl) {
      activeEl.scrollIntoView({ block: 'nearest' });
    }
  }, [activeIdx, open]);

  function onInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => (flatRows.length === 0 ? 0 : (i + 1) % flatRows.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) =>
        flatRows.length === 0 ? 0 : (i - 1 + flatRows.length) % flatRows.length,
      );
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const target = flatRows[activeIdx];
      if (target) runCommand(target.command);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
    }
  }

  return { onInputKeyDown };
}
