'use client';

// SPDX-License-Identifier: Apache-2.0

// Summary footer explaining where the SLO targets come from.
import type { HealthSloData } from '@/lib/services/admin-dtos';

export function HealthSummaryFooter({ data }: { data: HealthSloData }) {
  return (
    <div className="border-border rounded-sm border p-4">
      <p className="text-fg-subtle text-xs">
        SLO targets from{' '}
        <code className="bg-bg-elev-2 rounded-sm px-1 py-0.5 text-xs">
          docs/INCIDENT-RESPONSE.md §2
        </code>
        . Error budget remaining = (current − target) / (1 − target), floored at 0. When budget is
        exhausted, freeze non-critical deploys.
        {data.langfuseActive && data.langfuseBaseUrl && (
          <>
            {' '}
            Langfuse tracing is active —{' '}
            <a
              href={data.langfuseBaseUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:no-underline"
            >
              open LLM traces
            </a>
            .
          </>
        )}
        {!data.langfuseActive && (
          <>
            {' '}
            Langfuse tracing is off — set{' '}
            <code className="bg-bg-elev-2 rounded-sm px-1 py-0.5 text-xs">LANGFUSE_PUBLIC_KEY</code>
            ,{' '}
            <code className="bg-bg-elev-2 rounded-sm px-1 py-0.5 text-xs">LANGFUSE_SECRET_KEY</code>
            , <code className="bg-bg-elev-2 rounded-sm px-1 py-0.5 text-xs">LANGFUSE_BASE_URL</code>{' '}
            to enable LLM observability.
          </>
        )}
      </p>
    </div>
  );
}
