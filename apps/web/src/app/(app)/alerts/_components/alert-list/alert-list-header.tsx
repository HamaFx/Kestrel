'use client';

// SPDX-License-Identifier: Apache-2.0

// Alerts header controls: view filter, new-alert trigger, and fetch indicator.
import { IconPlus } from '@tabler/icons-react';

import { Button } from '@/components/ui/button';
import { Segmented } from '@/components/ui/segmented';
import { StaleIndicator } from '@/components/ui/stale-indicator';

import type { AlertFilter } from './use-alerts';

interface AlertListHeaderProps {
  filter: AlertFilter;
  onFilterChange: (filter: AlertFilter) => void;
  showNew: boolean;
  onNew: () => void;
  isFetching: boolean;
}

export function AlertListHeader({
  filter,
  onFilterChange,
  showNew,
  onNew,
  isFetching,
}: AlertListHeaderProps) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <Segmented<'all' | 'active' | 'past'>
          value={filter}
          onChange={onFilterChange}
          ariaLabel="Filter alerts"
          options={[
            { value: 'all', label: 'All' },
            { value: 'active', label: 'Active' },
            { value: 'past', label: 'Past' },
          ]}
          variant="solid"
          size="sm"
        />
        {showNew ? (
          <Button type="button" size="sm" onClick={onNew}>
            <IconPlus className="size-4" />
            New alert
          </Button>
        ) : null}
      </div>
      <StaleIndicator isFetching={isFetching} />
    </div>
  );
}
