// SPDX-License-Identifier: Apache-2.0

// Verified briefing body: bias/regime headline, the scenario ledger, risk
// notes, and the data-source disclosure list. Rendered as children of the
// unified SyndicateDossierCard shell by `mastra-report.tsx`.
import { IconAlertTriangle, IconCircleCheck } from '@tabler/icons-react';

import { MastraReportScenarios } from './mastra-report-scenarios';
import type { MastraReportView } from './mastra-report-schema';

export function ReportBody({
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
