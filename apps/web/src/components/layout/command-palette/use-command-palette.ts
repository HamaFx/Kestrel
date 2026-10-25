// SPDX-License-Identifier: Apache-2.0
// Palette-level state: open/query/active index, the ⌘K shortcut, focus reset
// on open, and the action dispatcher for the selected command.

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useId, useRef, useState } from 'react';

import type { CommandItem } from '@/lib/commands';

export function useCommandPalette({ onNewChat }: { onNewChat?: (() => void) | undefined }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();

  // Keyboard shortcut listener.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const isK = e.key === 'k' || e.key === 'K';
      if (isK && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Reset state every time the drawer opens.
  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIdx(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const runCommand = useCallback(
    (cmd: CommandItem) => {
      setOpen(false);
      if (cmd.id === 'create-chat') {
        if (onNewChat) {
          onNewChat();
        } else {
          router.push('/chat?new=1');
        }
        return;
      }
      if (cmd.action) {
        cmd.action();
        return;
      }
      if (cmd.href) {
        router.push(cmd.href);
      }
    },
    [router, onNewChat],
  );

  return {
    open,
    setOpen,
    query,
    setQuery,
    activeIdx,
    setActiveIdx,
    inputRef,
    inputId,
    runCommand,
  };
}
