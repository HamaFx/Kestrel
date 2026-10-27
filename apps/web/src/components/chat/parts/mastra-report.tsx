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
import { IconAlertTriangle, IconClock, IconDatabase } from '@tabler/icons-react';

import { normalizeCritiques } from '@/lib/chat-transport/job-result';

import { useWarRoomOpen } from '../war-room-context';
import { type AgentProgress } from './agent-deliberation/agent-meta';
import { ReportBody } from './mastra-report-body';
import { MastraReportMetaSchema, type MastraReportMetaView } from './mastra-report-schema';
import type { SyndicateTradeOpinion } from './syndicate-dossier/extract-trade-levels';
import { SyndicateDossierCard } from './syndicate-dossier/syndicate-dossier-card';

export function MastraReportPart({ data }: { data: unknown }) {
  // Desktop War Room open → the inline dossier collapses to its ticket +
  // "open in War Room" pill so the 4-desk cards never render twice.
  const warRoomOpen = useWarRoomOpen();
  const parsed = MastraReportMetaSchema.safeParse(data);
  if (parsed.success) {
    return <MastraReportCard meta={parsed.data} compactInline={warRoomOpen} />;
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
        compactInline={warRoomOpen}
        {...(multiData.dataQuality ? { dataQuality: multiData.dataQuality } : {})}
      />
    );
  }

  return null;
}

export function MastraReportCard({
  meta,
  compactInline,
}: {
  meta: MastraReportMetaView;
  compactInline?: boolean;
}) {
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
        {...(compactInline ? { compactInline: true } : {})}
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
