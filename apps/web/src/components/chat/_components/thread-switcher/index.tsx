'use client';

/**
 * Copyright 2026 Kestrel
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import { IconPlus } from '@tabler/icons-react';

import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';

import type { ThreadSummary } from '../../chat-top-bar';
import { BulkActionsBar } from './bulk-actions-bar';
import { ThreadList } from './thread-list';
import { ThreadSearchInput } from './thread-search-input';
import { useThreadSwitcher } from './use-thread-switcher';

interface ThreadSwitcherProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  threadId: string;
  threads: ThreadSummary[];
  onPickNew: () => void;
}

export function ThreadSwitcher({
  open,
  onOpenChange,
  threadId,
  threads,
  onPickNew,
}: ThreadSwitcherProps) {
  const {
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
  } = useThreadSwitcher({ open, threadId, threads, onOpenChange });

  const showSearch = threads.length >= 2;
  const showSelectToggle = threads.length >= 2;

  return (
    <Drawer
      open={open}
      onOpenChange={(v) => {
        if (!v) exitSelectMode();
        onOpenChange(v);
      }}
    >
      <DrawerContent>
        <DrawerHeader>
          <div className="flex items-center justify-between gap-2">
            <DrawerTitle>Conversations</DrawerTitle>
            {showSelectToggle ? (
              <button
                type="button"
                onClick={() => (selectMode ? exitSelectMode() : setSelectMode(true))}
                aria-pressed={selectMode}
                className="text-fg-muted hover:text-fg border-border/60 hover:bg-bg-elev-2 text-caption inline-flex h-10 items-center gap-1.5 rounded-sm border px-3 font-medium"
              >
                {selectMode ? 'Cancel' : 'Select'}
              </button>
            ) : null}
          </div>
        </DrawerHeader>

        {showSearch ? <ThreadSearchInput query={query} onQueryChange={setQuery} /> : null}

        <div className="flex flex-col gap-1 px-2 pb-2">
          <button
            type="button"
            onClick={onPickNew}
            className="text-fg hover:bg-bg-elev-2 flex min-h-[56px] items-center gap-3 rounded-sm px-3 py-3 text-left text-sm font-semibold transition-colors"
          >
            <span
              aria-hidden="true"
              className="text-fg bg-bg-elev-3 inline-flex size-10 items-center justify-center rounded-sm"
            >
              <IconPlus className="size-5" />
            </span>
            New conversation
          </button>
        </div>
        <div className="border-border border-t" />

        <ThreadList
          filtered={filtered}
          query={query}
          threadId={threadId}
          selectMode={selectMode}
          selectedIds={selectedIds}
          now={now}
          onPickThread={pickThread}
          onToggleSelected={toggleSelected}
        />

        {selectMode ? (
          <BulkActionsBar
            selectedCount={selectedIds.size}
            deleting={deleting}
            onCancel={exitSelectMode}
            onDelete={() => void bulkDelete()}
          />
        ) : null}
        {confirmEl}
      </DrawerContent>
    </Drawer>
  );
}
