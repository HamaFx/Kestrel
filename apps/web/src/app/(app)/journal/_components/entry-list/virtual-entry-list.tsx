'use client';

// SPDX-License-Identifier: Apache-2.0

// Virtualized journal row list with live price lookups and precomputed labels.
import type { JournalEntry, Symbol } from '@kestrel/shared';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useRef } from 'react';

import type { useConfirm } from '@/components/ui/confirm-drawer';

import { EntryRow } from '../entry-row';

type ConfirmFn = ReturnType<typeof useConfirm>[1];

interface VirtualEntryListProps {
  entries: JournalEntry[];
  timeLabels: Map<string, { openedAt: string; closedAt: string | null }>;
  priceMap: Map<Symbol, number>;
  onClosed: () => void;
  onDeleted: () => void;
  confirm: ConfirmFn;
}

export function VirtualEntryList({
  entries,
  timeLabels,
  priceMap,
  onClosed,
  onDeleted,
  confirm,
}: VirtualEntryListProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: entries.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 120,
    overscan: 5,
  });

  return (
    <div
      ref={parentRef}
      className="scrollbar-thumb-divider scrollbar-thin overflow-y-auto pr-1"
      style={{ maxHeight: '750px' }}
    >
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualizer.getVirtualItems().map((item) => {
          const e = entries[item.index];
          if (!e) return null;
          const labels = timeLabels.get(e.id);
          return (
            <div
              key={item.key}
              data-index={item.index}
              ref={virtualizer.measureElement}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${item.start}px)`,
              }}
              className="py-1.5"
            >
              <EntryRow
                entry={e}
                openedAtLabel={labels?.openedAt ?? ''}
                closedAtLabel={labels?.closedAt ?? ''}
                livePrice={priceMap.get(e.symbol)}
                onClosed={onClosed}
                onDeleted={onDeleted}
                confirm={confirm}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
