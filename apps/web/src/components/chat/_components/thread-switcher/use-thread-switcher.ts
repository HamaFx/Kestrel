'use client';

// SPDX-License-Identifier: Apache-2.0

// State + actions for the conversation switcher drawer: debounced search,
// relative-time ticker, bulk-select mode, and bulk delete.
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { useConfirm } from '@/components/ui/confirm-drawer';
import { apiMutate } from '@/lib/http/api-client';

import type { ThreadSummary } from '../../chat-top-bar';

interface UseThreadSwitcherArgs {
  open: boolean;
  threadId: string;
  threads: ThreadSummary[];
  onOpenChange: (open: boolean) => void;
}

export function useThreadSwitcher({
  open,
  threadId,
  threads,
  onOpenChange,
}: UseThreadSwitcherArgs) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  // Phase A — UX_UPGRADE_PLAN.md item 5.
  // Bulk-select mode. Only enabled when there are >5 threads so
  // users with small thread lists aren't shown UI they don't need.
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [confirmEl, confirm] = useConfirm();

  const [now, setNow] = useState(Date.now());
  // Debounced search term — prevents re-filter on every keystroke.
  const [debouncedQuery, setDebouncedQuery] = useState('');

  useEffect(() => {
    if (!open) return;
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 60000);
    return () => clearInterval(interval);
  }, [open]);

  // Debounce search input (300ms)
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(timer);
  }, [query]);

  const filtered = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase();
    if (!q) return threads;
    return threads.filter((t) => (t.title ?? '').toLowerCase().includes(q));
  }, [debouncedQuery, threads]);

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function exitSelectMode() {
    setSelectMode(false);
    setSelectedIds(new Set());
  }

  /** Close the drawer and navigate to the picked thread (unless it's active). */
  function pickThread(id: string) {
    onOpenChange(false);
    if (id !== threadId) router.push(`/chat/${id}`);
  }

  async function bulkDelete() {
    if (selectedIds.size === 0 || deleting) return;
    const ids = Array.from(selectedIds);
    const ok = await confirm({
      title: `Delete ${ids.length} conversation${ids.length === 1 ? '' : 's'}?`,
      description: 'This cannot be undone.',
      confirmLabel: 'Delete',
      tone: 'danger',
    });
    if (!ok) return;
    setDeleting(true);
    try {
      const { deleted } = await apiMutate<{ deleted?: number }>('/api/chat/threads/bulk-delete', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ids }),
      });
      toast.success(`Deleted ${deleted ?? ids.length}`);
      // If the active thread was deleted, jump to /chat (the
      // landing route will pick the next-most-recent or create
      // a fresh one). Otherwise stay put.
      if (selectedIds.has(threadId)) {
        const remaining = threads.find((t) => !selectedIds.has(t.id));
        router.push(remaining ? `/chat/${remaining.id}` : '/chat');
      } else {
        router.refresh();
      }
      exitSelectMode();
      onOpenChange(false);
    } catch (err) {
      toast.error('Bulk delete failed', {
        description: err instanceof Error ? err.message : 'unknown',
      });
    } finally {
      setDeleting(false);
    }
  }

  return {
    query,
    setQuery,
    selectMode,
    setSelectMode,
    exitSelectMode,
    selectedIds,
    toggleSelected,
    deleting,
    bulkDelete,
    filtered,
    now,
    pickThread,
    confirmEl,
  };
}
