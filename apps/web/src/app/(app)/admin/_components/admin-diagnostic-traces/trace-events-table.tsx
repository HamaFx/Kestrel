'use client';

// SPDX-License-Identifier: Apache-2.0

// Keyboard-accessible timeline table: one row per explorer event, opening the
// trace detail drawer via the row callback.
import { IconStethoscope } from '@tabler/icons-react';

import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatRelative } from '@/lib/formatters/datetime';
import { formatAbsoluteTime, formatMs } from '@/lib/formatters/format-number';
import type { TraceExplorerEvent } from '@/lib/services/admin-dtos';

import { primaryCorrelation, sourceTone, statusTone } from './trace-format';

function EventRow({
  event,
  onOpen,
}: {
  event: TraceExplorerEvent;
  onOpen: (event: TraceExplorerEvent) => void;
}) {
  const correlation = primaryCorrelation(event);
  return (
    <TableRow
      tabIndex={0}
      role="button"
      aria-label={`Inspect ${event.name} ${event.status}`}
      className="focus-visible:bg-bg-elev-2 focus-visible:ring-brand/50 cursor-pointer outline-none focus-visible:ring-2"
      onClick={() => onOpen(event)}
      onKeyDown={(keyboardEvent) => {
        if (keyboardEvent.key === 'Enter' || keyboardEvent.key === ' ') {
          keyboardEvent.preventDefault();
          onOpen(event);
        }
      }}
    >
      <TableCell data-label="Source">
        <Badge tone={sourceTone(event.source)}>{event.source}</Badge>
      </TableCell>
      <TableCell data-label="Event" className="text-fg font-mono text-xs">
        {event.name}
      </TableCell>
      <TableCell data-label="Status">
        <Badge tone={statusTone(event.status)}>{event.status}</Badge>
      </TableCell>
      <TableCell
        data-label="Correlation"
        className="text-fg-subtle max-w-36 truncate font-mono text-xs"
        title={correlation ?? undefined}
      >
        {correlation ?? '—'}
      </TableCell>
      <TableCell data-label="Duration" numeric className="text-fg-subtle">
        {event.durationMs === null ? '—' : formatMs(event.durationMs)}
      </TableCell>
      <TableCell
        data-label="Time"
        className="text-fg-subtle"
        title={formatAbsoluteTime(event.timestamp)}
      >
        {formatRelative(event.timestamp)}
      </TableCell>
    </TableRow>
  );
}

export function TraceEventsTable({
  events,
  onOpen,
}: {
  events: TraceExplorerEvent[];
  onOpen: (event: TraceExplorerEvent) => void;
}) {
  return (
    <div className="overflow-hidden overflow-x-auto rounded-xl border border-white/[0.07]">
      <Table stackOnMobile>
        <caption className="sr-only">AI execution timeline</caption>
        <TableHeader>
          <tr>
            <TableHead>Source</TableHead>
            <TableHead>Event</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Correlation</TableHead>
            <TableHead numeric>Duration</TableHead>
            <TableHead>Time</TableHead>
          </tr>
        </TableHeader>
        <TableBody>
          {events.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="px-4 py-8">
                <EmptyState
                  icon={<IconStethoscope className="size-6" />}
                  title="No timeline events"
                  description="Try a trace, run, job, thread, or message ID."
                  bare
                />
              </TableCell>
            </TableRow>
          ) : (
            events.map((event) => <EventRow key={event.id} event={event} onOpen={onOpen} />)
          )}
        </TableBody>
      </Table>
    </div>
  );
}
