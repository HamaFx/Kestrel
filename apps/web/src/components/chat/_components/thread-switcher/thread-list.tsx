'use client';

// SPDX-License-Identifier: Apache-2.0

// Conversation list with the empty state and bulk-select rows.
import { IconMessages, IconSearch } from '@tabler/icons-react';

import { EmptyState } from '@/components/ui/empty-state';

import type { ThreadSummary } from '../../chat-top-bar';
import { ThreadRow } from './thread-row';

interface ThreadListProps {
  filtered: ThreadSummary[];
  query: string;
  threadId: string;
  selectMode: boolean;
  selectedIds: Set<string>;
  now: number;
  onPickThread: (id: string) => void;
  onToggleSelected: (id: string) => void;
}

export function ThreadList({
  filtered,
  query,
  threadId,
  selectMode,
  selectedIds,
  now,
  onPickThread,
  onToggleSelected,
}: ThreadListProps) {
  return (
    <ul className="scrollbar-hide flex max-h-[60svh] flex-col gap-1 overflow-y-auto px-2 pt-2 pb-4">
      {filtered.length === 0 ? (
        <li className="px-1">
          <EmptyState
            bare
            tone="muted"
            icon={
              query ? (
                <IconSearch className="size-5" aria-hidden="true" />
              ) : (
                <IconMessages className="size-5" aria-hidden="true" />
              )
            }
            title={query ? 'No matches' : 'No other conversations'}
            description={
              query
                ? 'Try a different search term.'
                : 'Start a new conversation to keep the ideas flowing.'
            }
          />
        </li>
      ) : (
        filtered.map((t) => {
          const isActive = t.id === threadId;
          const isSelected = selectedIds.has(t.id);
          return (
            <li key={t.id}>
              <ThreadRow
                thread={t}
                isActive={isActive}
                selectMode={selectMode}
                isSelected={isSelected}
                now={now}
                onPick={() => onPickThread(t.id)}
                onToggleSelected={() => onToggleSelected(t.id)}
              />
            </li>
          );
        })
      )}
    </ul>
  );
}
