'use client';

// SPDX-License-Identifier: Apache-2.0

// Time-window selector and refresh control for the Mastra run list.
import { IconRefresh } from '@tabler/icons-react';

import { Button } from '@/components/ui/button';

interface MastraRunsToolbarProps {
  hours: number;
  onHoursChange: (hours: number) => void;
  onRefresh: () => void;
}

export function MastraRunsToolbar({ hours, onHoursChange, onRefresh }: MastraRunsToolbarProps) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-2 pb-3">
      <select
        aria-label="Time window"
        value={hours}
        onChange={(event) => onHoursChange(Number(event.target.value))}
        className="border-border bg-bg-elev-2 text-fg rounded-sm border px-2 py-1 text-sm"
      >
        <option value={24}>Last 24h</option>
        <option value={72}>Last 3d</option>
        <option value={168}>Last 7d</option>
      </select>
      <Button variant="secondary" size="sm" onClick={onRefresh}>
        <IconRefresh className="size-4" aria-hidden="true" />
        Refresh
      </Button>
    </div>
  );
}
