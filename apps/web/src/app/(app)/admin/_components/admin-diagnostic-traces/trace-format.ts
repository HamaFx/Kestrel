// SPDX-License-Identifier: Apache-2.0

// Explorer filter shape plus the badge-tone, correlation and clipboard
// helpers shared by the trace timeline table and the detail drawer.
import type { BadgeTone } from '@/components/ui/badge';
import type { TraceExplorerEvent } from '@/lib/services/admin-dtos';

export interface ExplorerFilters {
  traceId?: string;
  runId?: string;
  jobId?: string;
  threadId?: string;
  messageId?: string;
}

export const FILTER_FIELDS: Array<{
  key: keyof ExplorerFilters;
  label: string;
  placeholder: string;
}> = [
  { key: 'traceId', label: 'Trace ID', placeholder: 'trace UUID' },
  { key: 'runId', label: 'Run ID', placeholder: 'worker run' },
  { key: 'jobId', label: 'Job ID', placeholder: 'analysis job' },
  { key: 'threadId', label: 'Thread ID', placeholder: 'thread UUID' },
  { key: 'messageId', label: 'Message ID', placeholder: 'message UUID' },
];

export function sourceTone(source: TraceExplorerEvent['source']): BadgeTone {
  if (source === 'tool') return 'brand';
  if (source === 'agent' || source === 'analysis-job') return 'success';
  if (source === 'budget' || source === 'outbox') return 'warn';
  return 'neutral';
}

export function statusTone(status: string): BadgeTone {
  if (status === 'failed' || status === 'dead' || status === 'error') return 'danger';
  if (status === 'processing' || status === 'running' || status === 'pending') return 'warn';
  if (status === 'completed' || status === 'complete' || status === 'done') return 'success';
  return 'neutral';
}

export function primaryCorrelation(event: TraceExplorerEvent): string | null {
  return event.traceId ?? event.jobId ?? event.runId ?? event.threadId ?? event.messageId;
}

export async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
  }
}
