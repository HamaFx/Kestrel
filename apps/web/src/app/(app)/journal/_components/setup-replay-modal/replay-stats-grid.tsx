'use client';

// SPDX-License-Identifier: Apache-2.0

// Replay analytics grid: realized R, MFE, MAE, and execution efficiency.
import { IconGauge, IconTarget, IconTrendingDown, IconTrendingUp } from '@tabler/icons-react';

import {
  Kpi,
  KpiFooter,
  KpiGroup,
  KpiHeader,
  KpiLabel,
  KpiTrend,
  KpiValue,
} from '@/components/ui/kpi';
import type { TradeSetupReplayDTO } from '@/lib/services/journal';

export function ReplayStatsGrid({ replay }: { replay: TradeSetupReplayDTO }) {
  const realizedR = replay.stats.realizedRR;
  const plannedR = replay.stats.plannedRR;
  const planDelta = realizedR !== null && plannedR !== null ? realizedR - plannedR : null;

  return (
    <KpiGroup cols={4}>
      <Kpi>
        <KpiHeader>
          <KpiLabel>
            <IconTarget className="size-3.5" />
            <span>Realized R</span>
          </KpiLabel>
          {planDelta !== null ? (
            <KpiTrend change={planDelta} goodDirection="up" suffix="R" />
          ) : null}
        </KpiHeader>
        <KpiValue tone={(realizedR ?? 0) > 0 ? 'bull' : 'bear'}>
          {realizedR !== null ? `${realizedR >= 0 ? '+' : ''}${realizedR.toFixed(2)} R` : 'N/A'}
        </KpiValue>
        <KpiFooter>Planned: {plannedR ? `${plannedR.toFixed(2)} R` : '—'}</KpiFooter>
      </Kpi>

      <Kpi>
        <KpiHeader>
          <KpiLabel>
            <IconTrendingUp className="text-bull size-3.5" />
            <span>Max Runup (MFE)</span>
          </KpiLabel>
        </KpiHeader>
        <KpiValue tone="bull">
          {replay.mfe.r !== null ? `+${replay.mfe.r.toFixed(2)} R` : '—'}
        </KpiValue>
        <KpiFooter>+{replay.mfe.pips.toFixed(1)} pips peak</KpiFooter>
      </Kpi>

      <Kpi>
        <KpiHeader>
          <KpiLabel>
            <IconTrendingDown className="text-bear size-3.5" />
            <span>Max Drawdown (MAE)</span>
          </KpiLabel>
          {replay.mae.r !== null ? (
            <KpiTrend change={replay.mae.r} goodDirection="down" suffix="R" />
          ) : null}
        </KpiHeader>
        <KpiValue tone="bear">
          {replay.mae.r !== null ? `−${replay.mae.r.toFixed(2)} R` : '—'}
        </KpiValue>
        <KpiFooter>−{replay.mae.pips.toFixed(1)} pips adverse</KpiFooter>
      </Kpi>

      <Kpi>
        <KpiHeader>
          <KpiLabel>
            <IconGauge className="text-info size-3.5" />
            <span>Efficiency</span>
          </KpiLabel>
        </KpiHeader>
        <KpiValue tone="info">
          {replay.stats.executionEfficiencyPct !== null
            ? `${replay.stats.executionEfficiencyPct.toFixed(0)}%`
            : '—'}
        </KpiValue>
        <KpiFooter>
          {replay.stats.durationMs
            ? `${Math.round(replay.stats.durationMs / 60000)}m hold time`
            : 'Open position'}
        </KpiFooter>
      </Kpi>
    </KpiGroup>
  );
}
