'use client';

// SPDX-License-Identifier: Apache-2.0

// Keyboard-accessible timeline table: one row per explorer event, opening the
// trace detail drawer via the row callback.
import { IconStethoscope } from '@tabler/icons-react';

import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { formatAbsoluteTime, formatMs, formatRelativeTime } from '@/lib/formatters/format-number';
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
    <tr
      tabIndex={0}
      role="button"
      aria-label={`Inspect ${event.name} ${event.status}`}
      className="border-border hover:bg-bg-elev-1 focus-visible:bg-bg-elev-2 focus-visible:ring-brand/50 cursor-pointer border-t outline-none focus-visible:ring-2"
      onClick={() => onOpen(event)}
      onKeyDown={(keyboardEvent) => {
        if (keyboardEvent.key === 'Enter' || keyboardEvent.key === ' ') {
          keyboardEvent.preventDefault();
          onOpen(event);
        }
      }}
    >
      <td className="px-3 py-2">
        <Badge tone={sourceTone(event.source)}>{event.source}</Badge>
      </td>
      <td className="text-fg px-3 py-2 font-mono text-xs">{event.name}</td>
      <td className="px-3 py-2">
        <Badge tone={statusTone(event.status)}>{event.status}</Badge>
      </td>
      <td
        className="text-fg-subtle max-w-36 truncate px-3 py-2 font-mono text-xs"
        title={correlation ?? undefined}
      >
        {correlation ?? '—'}
      </td>
      <td className="text-fg-subtle px-3 py-2 tabular-nums">
        {event.durationMs === null ? '—' : formatMs(event.durationMs)}
      </td>
      <td className="text-fg-subtle px-3 py-2" title={formatAbsoluteTime(event.timestamp)}>
        {formatRelativeTime(event.timestamp)}
      </td>
    </tr>
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
    <div className="border-border overflow-hidden overflow-x-auto rounded-sm border">
      <table className="w-full text-sm">
        <caption className="sr-only">AI execution timeline</caption>
        <thead className="bg-bg-elev-2 text-fg-subtle">
          <tr>
            <th className="px-3 py-2 text-left font-medium">Source</th>
            <th className="px-3 py-2 text-left font-medium">Event</th>
            <th className="px-3 py-2 text-left font-medium">Status</th>
            <th className="px-3 py-2 text-left font-medium">Correlation</th>
            <th className="px-3 py-2 text-left font-medium">Duration</th>
            <th className="px-3 py-2 text-left font-medium">Time</th>
          </tr>
        </thead>
        <tbody>
          {events.length === 0 ? (
            <tr>
              <td colSpan={6} className="px-4 py-8">
                <EmptyState
                  icon={<IconStethoscope className="size-6" />}
                  title="No timeline events"
                  description="Try a trace, run, job, thread, or message ID."
                  bare
                />
              </td>
            </tr>
          ) : (
            events.map((event) => <EventRow key={event.id} event={event} onOpen={onOpen} />)
          )}
        </tbody>
      </table>
    </div>
  );
}
