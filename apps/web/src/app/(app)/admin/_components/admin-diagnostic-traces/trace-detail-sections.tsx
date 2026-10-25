'use client';

// SPDX-License-Identifier: Apache-2.0

// Trace-detail body blocks: the ID/timing summary card, the correlated
// timeline, captured errors and diagnostic steps.
import { IconBug, IconCopy, IconHash, IconUser } from '@tabler/icons-react';
import type { ReactNode } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatAbsoluteTime, formatMs, formatRelativeTime } from '@/lib/formatters/format-number';
import type { DiagnosticTraceDetail, TraceExplorerEvent } from '@/lib/services/admin-dtos';

import { sourceTone, statusTone } from './trace-format';

function DetailItem({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-fg-subtle text-xs font-medium tracking-wide uppercase">{label}</span>
      <div className="text-fg text-sm">{children}</div>
    </div>
  );
}

function StepRow({ step, index }: { step: DiagnosticTraceDetail['steps'][number]; index: number }) {
  return (
    <div className="border-border border-l-2 pl-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-fg text-sm font-medium">
          {index + 1}. {step.name}
        </span>
        <Badge
          tone={
            step.status === 'failed' ? 'danger' : step.status === 'completed' ? 'success' : 'warn'
          }
        >
          {step.status}
        </Badge>
      </div>
      {typeof step.durationMs === 'number' && (
        <p className="text-fg-subtle text-xs">{step.durationMs} ms</p>
      )}
      {step.metadata && Object.keys(step.metadata).length > 0 && (
        <pre className="bg-bg-elev-1 text-fg-subtle mt-1 overflow-x-auto rounded-sm p-2 text-xs">
          {JSON.stringify(step.metadata, null, 2)}
        </pre>
      )}
    </div>
  );
}

function ErrorRow({ error }: { error: DiagnosticTraceDetail['errors'][number] }) {
  const ts = new Date(error.timestamp);
  return (
    <div className="border-danger/30 border-l-2 pl-3">
      <div className="flex items-center gap-2">
        <IconBug className="text-danger size-4" aria-hidden="true" />
        <span className="text-danger text-sm font-medium">{error.name}</span>
      </div>
      <p className="text-fg text-sm">{error.message}</p>
      {error.stack && (
        <pre className="bg-bg-elev-1 text-fg-subtle mt-1 overflow-x-auto rounded-sm p-2 text-xs">
          {error.stack}
        </pre>
      )}
      <p className="text-fg-subtle mt-1 text-xs" title={formatAbsoluteTime(ts.toISOString())}>
        {formatRelativeTime(ts.toISOString())}
      </p>
    </div>
  );
}

export function TraceDetailSummary({
  detail,
  onCopy,
}: {
  detail: DiagnosticTraceDetail;
  onCopy: (text: string, label: string) => void;
}) {
  return (
    <div className="bg-bg-elev-1 border-border grid grid-cols-1 gap-3 rounded-sm border p-3 sm:grid-cols-2">
      <DetailItem label="Trace ID">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs break-all">{detail.id}</span>
          <Button
            variant="ghost"
            size="sm"
            className="h-10 w-10 p-0"
            aria-label="Copy trace ID"
            onClick={() => void onCopy(detail.id, 'Trace ID')}
          >
            <IconCopy className="size-4" aria-hidden="true" />
          </Button>
        </div>
      </DetailItem>
      <DetailItem label="Thread ID">
        <div className="flex items-center gap-2">
          <IconHash className="text-fg-subtle size-3" aria-hidden="true" />
          <span className="font-mono text-xs break-all">{detail.threadId}</span>
          <Button
            variant="ghost"
            size="sm"
            className="h-10 w-10 p-0"
            aria-label="Copy thread ID"
            onClick={() => void onCopy(detail.threadId, 'Thread ID')}
          >
            <IconCopy className="size-4" aria-hidden="true" />
          </Button>
        </div>
      </DetailItem>
      <DetailItem label="User ID">
        <div className="flex items-center gap-2">
          <IconUser className="text-fg-subtle size-3" aria-hidden="true" />
          <span className="font-mono text-xs break-all">{detail.userId}</span>
        </div>
      </DetailItem>
      <DetailItem label="Status">
        <Badge tone={statusTone(detail.status)}>{detail.status}</Badge>
      </DetailItem>
      <DetailItem label="Started">
        <span className="text-xs" title={formatAbsoluteTime(detail.startedAt)}>
          {formatRelativeTime(detail.startedAt)}
        </span>
      </DetailItem>
      {typeof detail.durationMs === 'number' && (
        <DetailItem label="Duration">
          <span className="text-xs">{formatMs(detail.durationMs)}</span>
        </DetailItem>
      )}
    </div>
  );
}

export function TraceDetailSections({
  detail,
  events,
}: {
  detail: DiagnosticTraceDetail;
  events: TraceExplorerEvent[];
}) {
  return (
    <>
      <div className="border-border bg-bg-elev-1 rounded-sm border p-3">
        <h4 className="mb-2 text-sm font-semibold">Correlated timeline ({events.length})</h4>
        {events.length === 0 ? (
          <p className="text-fg-subtle text-sm">No correlated rows found.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {events.map((event) => (
              <div
                key={event.id}
                className="border-border flex items-center justify-between gap-2 border-l-2 pl-3"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Badge tone={sourceTone(event.source)}>{event.source}</Badge>
                    <span className="text-fg truncate font-mono text-xs">{event.name}</span>
                  </div>
                  {event.error && <p className="text-danger mt-1 text-xs">{event.error}</p>}
                </div>
                <Badge tone={statusTone(event.status)}>{event.status}</Badge>
              </div>
            ))}
          </div>
        )}
      </div>

      {detail.errors.length > 0 && (
        <div className="border-danger/20 bg-bg-elev-1 rounded-sm border p-3">
          <h4 className="text-danger mb-2 text-sm font-semibold">
            Errors ({detail.errors.length})
          </h4>
          <div className="flex flex-col gap-3">
            {detail.errors.map((err, i) => (
              <ErrorRow key={i} error={err} />
            ))}
          </div>
        </div>
      )}

      <div className="border-border bg-bg-elev-1 rounded-sm border p-3">
        <h4 className="mb-2 text-sm font-semibold">Diagnostic steps ({detail.steps.length})</h4>
        {detail.steps.length === 0 ? (
          <p className="text-fg-subtle text-sm">No steps recorded.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {detail.steps.map((step, i) => (
              <StepRow key={i} step={step} index={i} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
