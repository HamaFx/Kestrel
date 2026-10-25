'use client';

// SPDX-License-Identifier: Apache-2.0

// Log-stream toolbar: connection status, connect/disconnect, pause, clear,
// download, text filter and the auto-scroll switch.
import {
  IconDownload,
  IconPlayerPause,
  IconPlayerPlay,
  IconSearch,
  IconTrash,
} from '@tabler/icons-react';
import type { Dispatch, SetStateAction } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/formatters/cn';

import { STATUS_BADGE, type LogStatus } from './log-format';

interface LogViewerToolbarProps {
  status: LogStatus;
  isPaused: boolean;
  onTogglePause: () => void;
  onClear: () => void;
  onDownload: () => void;
  filterQuery: string;
  onFilterChange: (value: string) => void;
  autoScroll: boolean;
  onAutoScrollChange: Dispatch<SetStateAction<boolean>>;
  onConnect: () => void;
  onDisconnect: () => void;
}

export function LogViewerToolbar({
  status,
  isPaused,
  onTogglePause,
  onClear,
  onDownload,
  filterQuery,
  onFilterChange,
  autoScroll,
  onAutoScrollChange,
  onConnect,
  onDisconnect,
}: LogViewerToolbarProps) {
  const statusBadge = STATUS_BADGE[status];

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="flex items-center gap-1.5 text-sm">
        <span className={cn('inline-block size-2 rounded-full', statusBadge.color)} />
        <span className="text-fg-subtle">{statusBadge.label}</span>
      </span>

      {status === 'idle' || status === 'error' ? (
        <Button variant="secondary" size="sm" onClick={onConnect}>
          Connect
        </Button>
      ) : (
        <Button
          variant="secondary"
          size="sm"
          onClick={onDisconnect}
          disabled={status !== 'connected' && status !== 'connecting'}
        >
          Disconnect
        </Button>
      )}

      <div className="border-border ml-1 flex items-center gap-1.5 border-l pl-2">
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
          aria-label={isPaused ? 'Resume' : 'Pause'}
          onClick={onTogglePause}
        >
          {isPaused ? (
            <IconPlayerPlay className="size-4" aria-hidden="true" />
          ) : (
            <IconPlayerPause className="size-4" aria-hidden="true" />
          )}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
          aria-label="Clear logs"
          onClick={onClear}
        >
          <IconTrash className="size-4" aria-hidden="true" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
          aria-label="Download logs"
          onClick={onDownload}
        >
          <IconDownload className="size-4" aria-hidden="true" />
        </Button>
      </div>

      <div className="border-border ml-1 flex items-center gap-1.5 border-l pl-2">
        <IconSearch className="text-fg-subtle size-4" aria-hidden="true" />
        <Input
          type="text"
          placeholder="Filter…"
          value={filterQuery}
          onChange={(e) => onFilterChange(e.target.value)}
          className="h-8 w-32 text-xs"
        />
      </div>

      <div className="ml-auto flex items-center gap-1.5">
        <span className="text-fg-subtle text-xs">Auto-scroll</span>
        <Switch checked={autoScroll} onCheckedChange={onAutoScrollChange} srLabel="Auto-scroll" />
      </div>
    </div>
  );
}
