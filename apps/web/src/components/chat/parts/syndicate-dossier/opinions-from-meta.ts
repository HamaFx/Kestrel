// SPDX-License-Identifier: Apache-2.0

// Normalize the single-symbol Mastra briefing into the opinion shape the
// dossier level extractor understands. The dock's setup chart is hidden until
// real candles exist, but the dossier still certifies entry/SL/targets from
// this payload.
import type { MastraReportMetaView } from '../mastra-report-schema';
import type { SyndicateTradeOpinion } from './extract-trade-levels';

/** The synthetic technical desk used by the single-symbol Mastra briefing. */
export function opinionsFromMastraMeta(meta: MastraReportMetaView): SyndicateTradeOpinion[] {
  const report = meta.report;
  if (!report) return [];
  return [
    {
      agentName: 'technical',
      bias: report.bias === 'unclear' ? 'neutral' : report.bias,
      confidence: report.confidence,
      reasoning: report.bottomLine,
      rawData: { scenarios: report.scenarios },
    },
  ];
}
