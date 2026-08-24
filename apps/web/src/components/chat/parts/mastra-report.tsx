'use client';

/**
 * Copyright 2026 Kestrel
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import { IconAlertTriangle, IconCircleCheck, IconClock, IconDatabase } from '@tabler/icons-react';

import { AgentDeliberation } from './agent-deliberation';
import { MastraReportScenarios } from './mastra-report-scenarios';
import {
  MastraReportMetaSchema,
  type MastraReportMetaView,
  type MastraReportView,
} from './mastra-report-schema';

export function MastraReportPart({ data }: { data: unknown }) {
  const parsed = MastraReportMetaSchema.safeParse(data);
  if (parsed.success) {
    return <MastraReportCard meta={parsed.data} />;
  }

  if (
    data &&
    typeof data === 'object' &&
    'agentOpinions' in data &&
    Array.isArray((data as { agentOpinions?: unknown }).agentOpinions)
  ) {
    const multiData = data as {
      mode?: string;
      agentOpinions: Array<{
        agentName: string;
        bias: 'bullish' | 'bearish' | 'neutral';
        confidence: number;
        reasoning: string;
      }>;
    };
    const agents = multiData.agentOpinions.map((op) => ({
      agentName: op.agentName,
      status: 'done' as const,
      opinion: {
        agentName: op.agentName,
        bias: op.bias,
        confidence: op.confidence,
        reasoning: op.reasoning,
      },
    }));
    return (
      <div className="mt-3 w-full">
        <AgentDeliberation
          agents={agents}
          mode={multiData.mode ?? 'full'}
          status="complete"
        />
      </div>
    );
  }

  return null;
}

export function MastraReportCard({ meta }: { meta: MastraReportMetaView }) {
  const report = meta.report;
  const isBlocked = meta.researchStatus === 'blocked' || !report;
  const qualityWarning = meta.dataQuality !== 'complete';

  return (
    <section
      role="region"
      aria-label="Verified XAUUSD report"
      className="border-border bg-bg-elev-1 mt-3 flex flex-col gap-3 rounded-sm border p-3"
      data-testid="mastra-report-card"
      data-mastra-agent="mastra-xauusd"
    >
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <IconDatabase className="text-fg-muted size-4" aria-hidden="true" />
          <span
            className="border-bull/30 bg-bull/5 text-bull rounded-sm border px-1.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase"
            data-testid="mastra-agent-badge"
          >
            Mastra
          </span>
          <h3 className="text-fg text-sm font-semibold">Verified XAUUSD report</h3>
        </div>
        <div className="text-caption text-fg-subtle flex items-center gap-2">
          <span>{meta.providerId}</span>
          <span aria-hidden="true">·</span>
          <span>{formatModel(meta.modelId)}</span>
        </div>
      </header>

      {isBlocked || !report ? (
        <div
          role="alert"
          className="border-warn/30 bg-warn/5 text-warn flex items-start gap-2 rounded-sm border p-2 text-xs"
        >
          <IconAlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            Analysis stopped because required market evidence was unavailable. No report was
            generated.
          </span>
        </div>
      ) : (
        <ReportBody report={report} qualityWarning={qualityWarning} />
      )}

      <footer className="border-border text-caption text-fg-subtle flex flex-wrap items-center gap-x-3 gap-y-1 border-t pt-2">
        <span className="inline-flex items-center gap-1">
          <IconClock className="size-3" aria-hidden="true" />
          Run data: {meta.packetId}
        </span>
        <span>Quality: {meta.dataQuality}</span>
        <span>Cost: ${meta.observedCost.toFixed(4)}</span>
      </footer>
    </section>
  );
}

function ReportBody({
  report,
  qualityWarning,
}: {
  report: MastraReportView;
  qualityWarning: boolean;
}) {
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <span className="border-border bg-bg-elev-2 text-fg rounded-sm border px-2 py-1 text-xs font-semibold uppercase">
          {report.bias}
        </span>
        <span className="text-fg-muted text-xs">
          {Math.round(report.confidence * 100)}% confidence
        </span>
        <span className="text-fg-muted text-xs">Regime: {report.regime}</span>
        {qualityWarning ? (
          <span className="border-warn/30 bg-warn/5 text-caption text-warn inline-flex items-center gap-1 rounded-sm border px-2 py-1 font-semibold">
            <IconAlertTriangle className="size-3" aria-hidden="true" />
            {report.dataQuality} data
          </span>
        ) : (
          <span className="text-caption text-bull inline-flex items-center gap-1">
            <IconCircleCheck className="size-3" aria-hidden="true" />
            complete data
          </span>
        )}
      </div>

      <p className="text-fg text-sm leading-relaxed">{report.bottomLine}</p>

      <div className="grid gap-2 sm:grid-cols-2">
        <Summary label="Technical" text={report.technicalSummary} />
        <Summary label="Fundamental" text={report.fundamentalSummary} />
      </div>

      <MastraReportScenarios scenarios={report.scenarios} />

      {report.contradictions.length > 0 || report.missingData.length > 0 ? (
        <div className="border-warn/30 bg-warn/5 text-fg-muted rounded-sm border p-3 text-xs">
          <h4 className="text-warn font-semibold">Warnings and limitations</h4>
          {report.contradictions.length > 0 ? (
            <List label="Conflicting signals" items={report.contradictions} />
          ) : null}
          {report.missingData.length > 0 ? (
            <List label="Missing data" items={report.missingData} />
          ) : null}
        </div>
      ) : null}

      <details className="text-fg-muted text-xs">
        <summary className="hover:text-fg flex cursor-pointer items-center gap-1 font-semibold">
          Sources and timestamps
        </summary>
        <ul className="mt-2 space-y-1 pl-4">
          {report.sources.map((source) => (
            <li key={source.evidenceId}>
              <span className="text-fg-subtle font-mono">{source.evidenceId}</span> {source.source}{' '}
              · {formatTimestamp(source.dataAsOf)}
            </li>
          ))}
        </ul>
      </details>
    </>
  );
}

function Summary({ label, text }: { label: string; text: string }) {
  return (
    <div className="border-border bg-bg-elev-2 rounded-sm border p-2">
      <h4 className="text-fg-subtle text-xs font-semibold tracking-wide uppercase">{label}</h4>
      <p className="text-fg-muted mt-1 text-xs leading-relaxed">{text}</p>
    </div>
  );
}

function List({ label, items }: { label: string; items: string[] }) {
  return (
    <div className="mt-2">
      <span className="text-fg-subtle font-semibold">{label}</span>
      <ul className="mt-1 list-disc space-y-0.5 pl-4">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function formatModel(model: string): string {
  const tail = model.includes('/') ? model.slice(model.lastIndexOf('/') + 1) : model;
  return tail.replace(/[-_]/g, ' ');
}

function formatTimestamp(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}
