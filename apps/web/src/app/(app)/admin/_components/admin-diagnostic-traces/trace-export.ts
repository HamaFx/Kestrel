// SPDX-License-Identifier: Apache-2.0

// CSV export of the currently loaded explorer timeline rows.
import { downloadCSV } from '@/lib/formatters/format-number';
import type { TraceExplorerEvent } from '@/lib/services/admin-dtos';

export function exportTimelineCsv(events: TraceExplorerEvent[]) {
  downloadCSV(
    events.map((event) => ({
      source: event.source,
      name: event.name,
      status: event.status,
      traceId: event.traceId ?? '',
      runId: event.runId ?? '',
      jobId: event.jobId ?? '',
      threadId: event.threadId ?? '',
      messageId: event.messageId ?? '',
      durationMs: event.durationMs ?? '',
      timestamp: event.timestamp,
      error: event.error ?? '',
    })),
    `diagnostic-timeline-${new Date().toISOString().slice(0, 10)}.csv`,
  );
}
