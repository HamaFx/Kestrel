'use client';

// SPDX-License-Identifier: Apache-2.0

// Click-through drawer listing the trades that closed on the selected
// heatmap day.
import { EntryList } from '@/app/(app)/journal/_components/entry-list';
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { formatRelative } from '@/lib/formatters/format';

import type { DayBucket } from './heatmap-days';

export function DayTradesDrawer({
  selectedDay,
  onClose,
}: {
  selectedDay: DayBucket | null;
  onClose: () => void;
}) {
  return (
    <Drawer
      open={!!selectedDay}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DrawerContent>
        {selectedDay ? (
          <>
            <DrawerHeader>
              <DrawerTitle>
                {selectedDay.count} trade{selectedDay.count === 1 ? '' : 's'} ·{' '}
                {selectedDay.totalR >= 0 ? '+' : ''}
                {selectedDay.totalR.toFixed(1)}R
              </DrawerTitle>
              <DrawerDescription>
                {new Date(selectedDay.key).toLocaleDateString(undefined, {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
                {selectedDay.entries[0]?.closedAt
                  ? ` · closed ${formatRelative(selectedDay.entries[0].closedAt)}`
                  : null}
              </DrawerDescription>
            </DrawerHeader>
            <div className="px-4 pb-6">
              <EntryList entries={selectedDay.entries} onClosed={onClose} onDeleted={onClose} />
            </div>
            <div className="border-border border-t p-3">
              <DrawerClose className="text-fg-muted hover:text-fg text-body-sm w-full text-center">
                Close
              </DrawerClose>
            </div>
          </>
        ) : null}
      </DrawerContent>
    </Drawer>
  );
}
