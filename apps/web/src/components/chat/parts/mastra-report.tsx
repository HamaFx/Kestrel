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

import {
  type AgentProgress,
} from './agent-deliberation/agent-meta';
import { MastraReportScenarios } from './mastra-report-scenarios';
import {
  MastraReportMetaSchema,
  type MastraReportMetaView,
  type MastraReportView,
} from './mastra-report-schema';
import { normalizeCritiques } from '@/lib/chat-transport/job-result';
import { SyndicateDossierCard } from './syndicate-dossier/syndicate-dossier-card';
import type { SyndicateTradeOpinion } from './syndicate-dossier/extract-trade-levels';

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
    // Locked Decision 4A — settled 4-desk payloads render through the one
    // canonical SyndicateDossierCard (retires PixelDeskDeliberation).
    const multiData = data as {
      mode?: string;
      symbol?: string;
      dataQuality?: string;
      agentOpinions: SyndicateTradeOpinion[];
      committeeCritiques?: unknown[];
    };
    const agents: AgentProgress[] = multiData.agentOpinions.map((op) => ({
      agentName: op.agentName,
      status: 'done',
      opinion: {
        agentName: op.agentName,
        bias: op.bias,
        confidence: op.confidence,
        reasoning: op.reasoning,
        summary: op.reasoning,
        ...(typeof op.model === 'string' ? { model: op.model } : {}),
        ...(typeof op.latencyMs === 'number' ? { latencyMs: op.latencyMs } : {}),
      },
    }));
    return (
      <SyndicateDossierCard
        agents={agents}
        opinions={agents}
        mode={multiData.mode ?? 'full'}
        critiques={normalizeCritiques(multiData.committeeCritiques)}
        symbol={multiData.symbol ?? null}
        tradeOpinions={multiData.agentOpinions}
        {...(multiData.dataQuality ? { dataQuality: multiData.dataQuality } : {})}
      />
    );
  }

  return null;
}

export function MastraReportCard({ meta }: { meta: MastraReportMetaView }) {
  const report = meta.report;
  const isBlocked = meta.researchStatus === 'blocked' || !report;
  const qualityWarning = meta.dataQuality !== 'complete';

  // The briefing is a single-symbol read: its synthetic desk opinion mirrors
  // the report bias and the ticket wells come from the scenario rows.
  const tradeOpinions: SyndicateTradeOpinion[] = report
    ? [
        {
          agentName: 'technical',
          bias: report.bias === 'unclear' ? 'neutral' : report.bias,
          confidence: report.confidence,
          reasoning: report.bottomLine,
          rawData: { scenarios: report.scenarios },
        },
      ]
    : [];

  return (
    <div data-mastra-agent="mastra-xauusd" data-packet-id={meta.packetId}>
      <SyndicateDossierCard
        regionLabel="Verified XAUUSD report"
        testId="mastra-report-card"
        symbol={report?.symbol ?? null}
        mode="single"
        opinions={[]}
        agents={[]}
        tradeOpinions={tradeOpinions}
        dataQuality={report?.dataQuality ?? meta.dataQuality}
        badge={
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <IconDatabase className="text-fg-muted size-4" aria-hidden="true" />
              <span
                className="border-bull/30 bg-bull/5 text-bull rounded-sm border px-1.5 py-0.5 font-mono text-[10px] font-semibold tracking-wide uppercase"
                data-testid="mastra-agent-badge"
              >
                Verified Brief
              </span>
              <h3 className="text-fg text-sm font-semibold">
                {report?.symbol ? `${report.symbol} Market Briefing` : 'Verified Market Briefing'}
              </h3>
            </div>
          </div>
        }
      >
        {isBlocked || !report ? (
          <div
            role="alert"
            className="border-warn/30 bg-warn/5 text-warn flex items-start gap-2 rounded-sm border p-2 text-xs"
          >
            <IconAlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>
              Live market feed data was temporarily unavailable. Briefing could not be generated.
            </span>
          </div>
        ) : (
          <ReportBody report={report} qualityWarning={qualityWarning} />
        )}

        <footer className="border-border/40 text-fg-subtle flex flex-wrap items-center gap-x-3 gap-y-1 border-t pt-2 font-mono text-[10px]">
          <span className="inline-flex items-center gap-1">
            <IconClock className="size-3" aria-hidden="true" />
            Data Check:{' '}
            {meta.dataQuality === 'complete' ? 'Verified against live feed' : meta.dataQuality}
          </span>
        </footer>
      </SyndicateDossierCard>
    </div>
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
          {Math.round(report.confidence * 100)}% conviction
        </span>
        <span className="text-fg-muted text-xs">Market Regime: {report.regime}</span>
        {qualityWarning ? (
          <span className="border-warn/30 bg-warn/5 text-caption text-warn inline-flex items-center gap-1 rounded-sm border px-2 py-1 font-semibold">
            <IconAlertTriangle className="size-3" aria-hidden="true" />
            {report.dataQuality} data
          </span>
        ) : (
          <span className="text-caption text-bull inline-flex items-center gap-1">
            <IconCircleCheck className="size-3" aria-hidden="true" />
            live data verified
          </span>
        )}
      </div>

      <p className="text-fg text-sm leading-relaxed">{report.bottomLine}</p>

      <div className="grid gap-2 sm:grid-cols-2">
        <Summary label="Technical Desk" text={report.technicalSummary} />
        <Summary label="Macro & Fundamental Desk" text={report.fundamentalSummary} />
      </div>

      <MastraReportScenarios scenarios={report.scenarios} />

      {report.contradictions.length > 0 || report.missingData.length > 0 ? (
        <div className="border-warn/30 bg-warn/5 text-fg-muted rounded-sm border p-3 text-xs">
          <h4 className="text-warn font-semibold">Risk Notes & Signal Conflicts</h4>
          {report.contradictions.length > 0 ? (
            <List label="Conflicting signals" items={report.contradictions} />
          ) : null}
          {report.missingData.length > 0 ? (
            <List label="Unavailable feeds" items={report.missingData} />
          ) : null}
        </div>
      ) : null}

      <details className="text-fg-muted text-xs">
        <summary className="hover:text-fg flex cursor-pointer items-center gap-1 font-semibold">
          Market Data Sources & Timestamps
        </summary>
        <ul className="mt-2 space-y-1 pl-4">
          {report.sources.map((source) => (
            <li key={source.evidenceId}>
              <span className="text-fg-subtle font-mono">{source.source}</span> ·{' '}
              {formatTimestamp(source.dataAsOf)}
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

function formatTimestamp(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}
