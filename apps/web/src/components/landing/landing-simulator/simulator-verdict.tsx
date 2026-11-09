'use client';

// SPDX-License-Identifier: Apache-2.0

// Sleek hardware verdict bars for the landing simulator: either the Risk
// Governor veto lock or the verified 5-level trade bracket bar.
import { IconAlertTriangle, IconBellRinging, IconCheck, IconCopy } from '@tabler/icons-react';
import { m } from 'motion/react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/formatters/cn';

import type { Scenario } from './scenarios';

interface VetoedVerdictCardProps {
  riskPercent: number;
  onRepairRisk: () => void;
}

export function VetoedVerdictCard({ riskPercent, onRepairRisk }: VetoedVerdictCardProps) {
  return (
    <m.div
      key="vetoed-card"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="border-bear/45 bg-bear/[0.07] flex flex-col justify-between gap-4 rounded-xl border p-4 sm:flex-row sm:items-center"
    >
      <div className="flex items-start gap-3">
        <div className="bg-bear/20 border-bear/40 text-bear flex size-9 shrink-0 items-center justify-center rounded-lg border">
          <IconAlertTriangle className="size-5" />
        </div>
        <div>
          <div className="text-bear font-mono text-xs font-bold tracking-wider uppercase">
            VETOED BY RISK GOVERNOR · {riskPercent.toFixed(2)}% EXCEEDS 1.00% CAP
          </div>
          <p className="text-fg-muted mt-0.5 font-sans text-xs">
            Macro, Technical, and COT desks aligned, but the Risk desk blocked execution until risk
            is dialled back to ≤ 1.00% equity.
          </p>
        </div>
      </div>
      <Button
        variant="secondary"
        size="sm"
        onClick={onRepairRisk}
        className="border-bear/40 bg-bear/20 hover:bg-bear/30 shrink-0 font-mono text-xs text-white"
      >
        Reset Risk to 0.85%
      </Button>
    </m.div>
  );
}

interface VerifiedPlanCardProps {
  scenario: Scenario;
  riskPercent: number;
  copiedHash: boolean;
  onCopyHash: (text: string) => void;
  onDispatch: () => void;
}

export function VerifiedPlanCard({
  scenario,
  riskPercent,
  copiedHash,
  onCopyHash,
  onDispatch,
}: VerifiedPlanCardProps) {
  const isLong = scenario.action.startsWith('BUY');

  return (
    <m.div
      key="verdict-card"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="border-brand/35 bg-brand/[0.05] rounded-xl border p-4 shadow-xl"
    >
      {/* Compact Header + Actions */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
          <span
            className={cn(
              'rounded border px-2 py-0.5 font-bold uppercase',
              isLong
                ? 'text-bull bg-bull/15 border-bull/35'
                : 'text-bear bg-bear/15 border-bear/35',
            )}
          >
            {scenario.action}
          </span>
          <span className="text-fg font-bold">{scenario.orderType}</span>
          <span className="text-brand border-brand/30 bg-brand/10 rounded border px-2 py-0.5 text-[11px] font-bold tabular-nums">
            {scenario.rr} R:R · EV {scenario.expectedValue}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onCopyHash(scenario.journalSummary)}
            className="text-fg-subtle hover:text-fg flex items-center gap-1.5 rounded-lg border border-white/10 bg-black/50 px-2.5 py-1.5 font-mono text-[11px] transition-colors"
          >
            {copiedHash ? (
              <IconCheck className="text-bull size-3.5" />
            ) : (
              <IconCopy className="size-3.5" />
            )}
            <span>{copiedHash ? 'Copied' : 'Copy Summary'}</span>
          </button>

          <Button
            variant="primary"
            size="sm"
            onClick={onDispatch}
            className="gap-1.5 font-mono text-xs tracking-wider uppercase"
          >
            <IconBellRinging className="size-3.5" />
            <span>Journal &amp; Arm Alerts</span>
          </Button>
        </div>
      </div>

      {/* Single 5-Column Tabular Bracket Strip */}
      <div className="mt-3 grid grid-cols-2 gap-2 font-mono text-xs tabular-nums sm:grid-cols-5">
        <div className="rounded-lg border border-white/[0.06] bg-[#0a0b0d] px-2.5 py-2">
          <span className="text-fg-subtle block text-[10px] uppercase">ENTRY</span>
          <span className="text-fg font-bold">{scenario.entry}</span>
        </div>
        <div className="rounded-lg border border-white/[0.06] bg-[#0a0b0d] px-2.5 py-2">
          <span className="text-bear block text-[10px] uppercase">
            STOP ({riskPercent.toFixed(2)}%)
          </span>
          <span className="text-bear font-bold">{scenario.invalidation}</span>
        </div>
        <div className="rounded-lg border border-white/[0.06] bg-[#0a0b0d] px-2.5 py-2">
          <span className="text-bull block text-[10px] uppercase">TP1 (40%)</span>
          <span className="text-bull font-bold">{scenario.target1}</span>
        </div>
        <div className="rounded-lg border border-white/[0.06] bg-[#0a0b0d] px-2.5 py-2">
          <span className="text-bull block text-[10px] uppercase">TP2 (40%)</span>
          <span className="text-bull font-bold">{scenario.target2}</span>
        </div>
        <div className="col-span-2 rounded-lg border border-white/[0.06] bg-[#0a0b0d] px-2.5 py-2 sm:col-span-1">
          <span className="text-brand block text-[10px] uppercase">TP3 RUNNER</span>
          <span className="text-brand font-bold">{scenario.target3}</span>
        </div>
      </div>
    </m.div>
  );
}
