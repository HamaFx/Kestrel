'use client';

// SPDX-License-Identifier: Apache-2.0

// Verdict stage cards for the landing simulator: the risk-veto block and the
// certified trade-plan ticket. Both render as motion roots so the parent
// `AnimatePresence` keeps ownership of enter/exit timing.
import { IconCheck, IconCopy, IconSend } from '@tabler/icons-react';
import { m } from 'motion/react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/formatters/cn';

import type { Scenario } from './scenarios';

interface VetoedVerdictCardProps {
  riskSlider: number;
  onRestoreLimit: () => void;
}

export function VetoedVerdictCard({ riskSlider, onRestoreLimit }: VetoedVerdictCardProps) {
  return (
    <m.div
      key="verdict-vetoed-card"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.3 }}
      className="border-bear/50 bg-bear/[0.04] rounded-xl border p-5 shadow-xl sm:p-6"
    >
      <div className="border-bear/20 flex flex-col justify-between gap-4 border-b pb-4 sm:flex-row sm:items-center">
        <div className="flex items-center gap-3">
          <span className="bg-bear size-3 animate-ping rounded-full" />
          <div>
            <div className="text-bear font-mono text-sm font-bold tracking-wider uppercase">
              SETUP BLOCKED BY RISK GUARDRAIL
            </div>
            <div className="text-fg-subtle font-mono text-[11px]">
              REASON: PROPOSED {riskSlider.toFixed(1)}% RISK EXCEEDS YOUR 1.0% MAXIMUM RISK PER
              TRADE
            </div>
          </div>
        </div>
        <span className="text-bear bg-bear/10 border-bear/30 rounded-full border px-3 py-1 text-center font-mono text-xs font-bold uppercase">
          RISK VETO ACTIVE
        </span>
      </div>

      <div className="surface-well border-bear/20 text-fg-muted mt-4 rounded-lg border bg-black/60 p-4 font-sans text-xs leading-relaxed">
        Kestrel&apos;s Risk Desk protects your account from emotional over-sizing. Lower the risk
        slider back to ≤ 1.0% to unlock the verified trade plan and target levels.
      </div>

      <div className="mt-4 flex items-center justify-between pt-2">
        <span className="text-fg-subtle font-mono text-[11px]">
          DRAWDOWN PROTECTION ACTIVE · CAPITAL PRESERVED
        </span>
        <Button
          variant="secondary"
          size="sm"
          onClick={onRestoreLimit}
          className="text-bull border-bull/30 hover:bg-bull/10 font-mono text-xs"
        >
          Restore 1.0% Limit
        </Button>
      </div>
    </m.div>
  );
}

interface VerifiedPlanCardProps {
  scenario: Scenario;
  copiedHash: boolean;
  onCopyHash: (text: string) => void;
  onDispatchBridge: () => void;
}

export function VerifiedPlanCard({
  scenario,
  copiedHash,
  onCopyHash,
  onDispatchBridge,
}: VerifiedPlanCardProps) {
  return (
    <m.div
      key="verdict-card"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.3 }}
      className="border-brand/40 bg-brand/[0.03] rounded-xl border p-5 shadow-xl sm:p-6"
    >
      {/* Certified Trade Plan Header */}
      <div className="flex flex-col justify-between gap-4 border-b border-white/10 pb-4 sm:flex-row sm:items-center">
        <div className="flex items-center gap-3">
          <span className="bg-bull size-3 rounded-full shadow-[0_0_8px_#3f9e3d]" />
          <div>
            <div className="text-fg flex items-center gap-2 font-mono text-sm font-bold uppercase">
              <span>VERIFIED COMMITTEE TRADE PLAN · {scenario.symbol}</span>
              <span className="text-brand bg-brand/10 border-brand/20 rounded border px-2 py-0.5 font-mono text-[10px]">
                {scenario.orderType}
              </span>
            </div>
            <div className="text-fg-subtle mt-0.5 flex items-center gap-2 font-mono text-[11px]">
              <span>PLAN ID: {scenario.txHash}</span>
              <button
                type="button"
                onClick={() => onCopyHash(scenario.journalSummary)}
                className="hover:text-fg transition-colors"
                title="Copy Trade Setup"
              >
                {copiedHash ? (
                  <IconCheck className="text-bull inline size-3" />
                ) : (
                  <IconCopy className="inline size-3" />
                )}
              </button>
              <span>· STATUS: 4-DESK CONSENSUS VERIFIED</span>
            </div>
          </div>
        </div>

        <span
          className={cn(
            'shrink-0 rounded-full border px-3 py-1 text-center font-mono text-xs font-bold uppercase',
            scenario.action.startsWith('BUY')
              ? 'text-bull bg-bull/10 border-bull/30 shadow-[0_0_12px_rgba(63,158,61,0.2)]'
              : 'text-bear bg-bear/10 border-bear/30 shadow-[0_0_12px_rgba(224,44,16,0.2)]',
          )}
        >
          {scenario.action}
        </span>
      </div>

      {/* Quantitative Levels Grid */}
      <div className="mt-5 grid grid-cols-2 gap-3 text-center font-mono sm:grid-cols-4">
        <div className="surface-well rounded-lg border border-white/5 bg-black/60 p-3.5">
          <span className="text-fg-subtle block text-[10px] uppercase">ENTRY ZONE</span>
          <span className="text-fg text-base font-bold tabular-nums">{scenario.entry}</span>
        </div>
        <div className="surface-well border-bear/20 rounded-lg border bg-black/60 p-3.5">
          <span className="text-bear block text-[10px] uppercase">INVALIDATION (SL)</span>
          <span className="text-bear text-base font-bold tabular-nums">
            {scenario.invalidation}
          </span>
        </div>
        <div className="surface-well rounded-lg border border-white/5 bg-black/60 p-3.5">
          <span className="text-bull block text-[10px] uppercase">TP1 (40% SCALE)</span>
          <span className="text-bull text-base font-bold tabular-nums">{scenario.target1}</span>
        </div>
        <div className="surface-well rounded-lg border border-white/5 bg-black/60 p-3.5">
          <span className="text-bull block text-[10px] uppercase">TP2 RUNNER ({scenario.rr})</span>
          <span className="text-bull text-base font-bold tabular-nums">{scenario.target2}</span>
        </div>
      </div>

      {/* Take Profit Cones Visual Breakdown */}
      <div className="mt-5 rounded-xl border border-white/5 bg-[#0e0f10] p-4">
        <div className="mb-3 flex items-center justify-between font-mono text-xs">
          <span className="text-fg-subtle uppercase">TAKE-PROFIT SCALING PLAN</span>
          <span className="text-fg font-bold">
            EXPECTED VALUE: {scenario.expectedValue} · RECOMMENDED RISK: {scenario.kellySize}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-3 font-mono text-xs">
          <div className="rounded-lg border border-white/10 bg-black/40 p-2.5">
            <div className="text-fg-subtle text-[10px]">TARGET 1 (1:1.5)</div>
            <div className="text-bull mt-1 font-bold">{scenario.target1}</div>
            <div className="text-fg-muted mt-0.5 text-[10px]">Scale Out 40%</div>
          </div>
          <div className="rounded-lg border border-white/10 bg-black/40 p-2.5">
            <div className="text-fg-subtle text-[10px]">TARGET 2 (1:2.5)</div>
            <div className="text-bull mt-1 font-bold">{scenario.target2}</div>
            <div className="text-fg-muted mt-0.5 text-[10px]">Scale Out 35%</div>
          </div>
          <div className="border-brand/30 bg-brand/[0.04] rounded-lg border p-2.5">
            <div className="text-brand text-[10px] font-bold">TARGET 3 RUNNER (1:4.0)</div>
            <div className="text-bull mt-1 font-bold">{scenario.target3}</div>
            <div className="text-fg-muted mt-0.5 text-[10px]">Trail Remaining 25%</div>
          </div>
        </div>
      </div>

      {/* Committee Verdict Rationale & Action Dispatch */}
      <div className="mt-5 flex flex-col justify-between gap-4 border-t border-white/10 pt-4 sm:flex-row sm:items-center">
        <div className="flex max-w-xl flex-col gap-1.5">
          <p className="text-fg-muted font-sans text-xs leading-relaxed">
            &ldquo;{scenario.arbiterVerdict}&rdquo;
          </p>
          <span className="text-fg-subtle font-mono text-[10px]">
            Direct Broker Bridge (MT5 / cTrader) — Planned on Roadmap
          </span>
        </div>

        <Button
          variant="tactical"
          size="md"
          onClick={onDispatchBridge}
          className="shrink-0 gap-2 font-mono text-xs font-semibold shadow-md"
        >
          <IconSend className="size-4" />
          Save to Journal & Arm Alerts
        </Button>
      </div>
    </m.div>
  );
}
