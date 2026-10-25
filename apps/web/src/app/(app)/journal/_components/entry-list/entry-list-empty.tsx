'use client';

// SPDX-License-Identifier: Apache-2.0

// Empty-state panel shown when the filtered trade list has no entries.
import { IconCompass } from '@tabler/icons-react';

import { EmptyState } from '@/components/ui/empty-state';

export function EntryListEmpty({ isFiltered }: { isFiltered: boolean }) {
  return (
    <EmptyState
      tone={isFiltered ? 'muted' : 'brand'}
      icon={<IconCompass className="size-5" />}
      title={isFiltered ? 'No entries match' : 'No entries yet'}
      description={
        isFiltered
          ? 'Try widening your search or clearing a filter to see more trades.'
          : 'Log your first trade to activate your portfolio analytics.'
      }
    />
  );
}
