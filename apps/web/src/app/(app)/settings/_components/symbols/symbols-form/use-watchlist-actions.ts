'use client';

// SPDX-License-Identifier: Apache-2.0

// Watchlist mutation handlers: reorder (buttons + drag), add, remove, and
// bulk delete. All mutations are optimistic with rollback on failure.
import type { DragEndEvent } from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import type { Dispatch, SetStateAction } from 'react';
import { toast } from 'sonner';

import { apiMutate } from '@/lib/http/api-client';

import type { SymbolItem } from '../sortable-symbol-row';
import type { SymbolCatalogItem } from './constants';

interface WatchlistActionsArgs {
  watchlist: SymbolItem[];
  setWatchlist: Dispatch<SetStateAction<SymbolItem[]>>;
  selected: Set<string>;
  setSelected: Dispatch<SetStateAction<Set<string>>>;
  setIsEditing: Dispatch<SetStateAction<boolean>>;
  catalog: SymbolCatalogItem[];
}

export function useWatchlistActions({
  watchlist,
  setWatchlist,
  selected,
  setSelected,
  setIsEditing,
  catalog,
}: WatchlistActionsArgs) {
  const moveItem = async (index: number, direction: 'up' | 'down') => {
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= watchlist.length) return;

    const newList = [...watchlist];
    const temp = newList[index]!;
    newList[index] = newList[newIndex]!;
    newList[newIndex] = temp;

    // Optimistic update
    setWatchlist(newList);
    setIsEditing(true);

    try {
      await apiMutate('/api/settings/symbols', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbols: newList.map((s) => s.symbol) }),
      });
      setIsEditing(false);
    } catch {
      toast.error('Failed to update symbol order');
      // Rollback
      setWatchlist(watchlist);
      setIsEditing(false);
    }
  };

  const handleAdd = async (symbol: string) => {
    const normalized = symbol.trim().toUpperCase();
    if (!normalized) return;

    if (watchlist.some((s) => s.symbol === normalized)) {
      toast.error(`${normalized} is already in your watchlist`);
      return;
    }

    const catalogItem = catalog.find((c) => c.symbol === normalized);
    if (!catalogItem) {
      toast.error(`${normalized} is not supported in the active catalog`);
      return;
    }

    const newItem: SymbolItem = {
      symbol: normalized,
      name: catalogItem.name,
      category: catalogItem.category,
      displayOrder: watchlist.length,
    };

    const originalList = [...watchlist];
    setWatchlist((prev) => [...prev, newItem]);
    setIsEditing(true);

    try {
      await apiMutate('/api/settings/symbols', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: normalized }),
      });
      toast.success(`${normalized} added to watchlist`);
      setIsEditing(false);
    } catch {
      toast.error(`Failed to add ${normalized}`);
      setWatchlist(originalList);
      setIsEditing(false);
    }
  };

  const handleRemove = async (symbol: string) => {
    const originalList = [...watchlist];
    setWatchlist((prev) => prev.filter((s) => s.symbol !== symbol));
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(symbol);
      return next;
    });
    setIsEditing(true);

    try {
      await apiMutate(`/api/settings/symbols/${symbol}`, {
        method: 'DELETE',
      });
      toast.success(`${symbol} removed from watchlist`);
      setIsEditing(false);
    } catch {
      toast.error(`Failed to remove ${symbol}`);
      setWatchlist(originalList);
      setIsEditing(false);
    }
  };

  const handleBulkDelete = async () => {
    if (selected.size === 0) return;
    const toDelete = Array.from(selected);
    const originalList = [...watchlist];

    setWatchlist((prev) => prev.filter((s) => !selected.has(s.symbol)));
    setSelected(new Set());
    setIsEditing(true);

    try {
      await Promise.all(
        toDelete.map((sym) => apiMutate(`/api/settings/symbols/${sym}`, { method: 'DELETE' })),
      );
      toast.success(`Successfully removed ${toDelete.length} symbols`);
      setIsEditing(false);
    } catch {
      toast.error('Failed to complete some symbol removals');
      setWatchlist(originalList);
      setIsEditing(false);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = watchlist.findIndex((w) => w.symbol === active.id);
    const newIndex = watchlist.findIndex((w) => w.symbol === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const newList = arrayMove(watchlist, oldIndex, newIndex);
    setWatchlist(newList);
    setIsEditing(true);

    apiMutate('/api/settings/symbols', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbols: newList.map((s) => s.symbol) }),
    })
      .then(() => {
        setIsEditing(false);
      })
      .catch(() => {
        toast.error('Failed to update symbol order');
        setWatchlist(watchlist);
        setIsEditing(false);
      });
  };

  return { moveItem, handleAdd, handleRemove, handleBulkDelete, handleDragEnd };
}
