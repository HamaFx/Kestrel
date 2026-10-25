'use client';

// SPDX-License-Identifier: Apache-2.0

// Loading, error, and empty states for the alerts list.
import { IconBell, IconBellOff, IconBellRinging, IconPlus } from '@tabler/icons-react';

import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';

import type { AlertFilter } from './use-alerts';

export function AlertsLoading() {
  return (
    <p role="status" className="text-fg-muted px-1 text-sm">
      Loading alerts…
    </p>
  );
}

export function AlertsError({ error }: { error: unknown }) {
  return (
    <p className="text-danger px-1 text-sm" role="alert">
      Failed to load: {(error as Error)?.message}
    </p>
  );
}

export function AlertsEmpty({ onNew }: { onNew: () => void }) {
  return (
    <EmptyState
      tone="muted"
      icon={<IconBell className="size-7" strokeWidth={1.75} />}
      title="No alerts configured"
      description="Create price or indicator alerts to get notified when the market hits your levels."
      action={
        <Button type="button" onClick={onNew}>
          <IconPlus className="size-4" />
          Create alert
        </Button>
      }
    />
  );
}

interface AlertsFilteredEmptyProps {
  filter: AlertFilter;
  onShowAll: () => void;
}

export function AlertsFilteredEmpty({ filter, onShowAll }: AlertsFilteredEmptyProps) {
  return (
    <EmptyState
      tone="muted"
      icon={
        filter === 'past' ? (
          <IconBellRinging className="size-7" strokeWidth={1.75} />
        ) : (
          <IconBellOff className="size-7" strokeWidth={1.75} />
        )
      }
      title={`No ${filter} alerts`}
      description={
        filter === 'past'
          ? 'No triggered or paused alerts in this view yet.'
          : 'No currently active alerts — create a new alert or resume a paused one.'
      }
      action={
        filter !== 'all' ? (
          <Button type="button" variant="secondary" size="sm" onClick={onShowAll}>
            Show all alerts
          </Button>
        ) : undefined
      }
    />
  );
}
