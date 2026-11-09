'use client';

// SPDX-License-Identifier: Apache-2.0

// Verdict stage cards for the landing simulator: the risk-veto shield and the
// unified 5-level trade ticket with instant journal/alert arming.
import { IconBellRinging, IconCheck, IconCopy, IconShieldLock } from '@tabler/icons-react';
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
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.25 }}
      className="border-bear/50 bg-bear/[0.04] rounded-xl border p-5 shadow-xl sm:p-6"
    >
      <div className="border-bear/20 flex flex-col justify-between gap-4 border-b pb-4 sm:flex-row sm:items-center">
        <div className="flex items-center gap-3">
          <IconShieldLock className="text-bear size-5 shrink-0" />
          <div>
            <div className="text-bear font-mono text-sm font-bold tracking-wider uppercase">
              TRADE TICKET LOCKED BY 1% SHIELD
            </div>
            <div className="text-fg-subtle font-mono text-[11px]">
              {riskSlider.toFixed(1)}% RISK EXCEEDS YOUR 1.0% ACCOUNT DRAWDOWN RULE
            </div>
          </div>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={onRestoreLimit}
          className="text-bull border-bull/30 hover:bg-bull/10 font-mono text-xs"
        >
          Reset Risk to 1.0%
        </Button>
      </div>

      <p className="text-fg-muted mt-4 font-sans text-xs leading-relaxed">
        Even when price action, news, and whales all line up, one oversized trade can wreck weeks of
        gains. Kestrel hides the execution ticket until your risk is back inside 1.0%.
      </p>
    </m.div>
  );
}

interface VerifiedPlanCardProps {
  scenario: Scenario;
  copiedHash: boolean;
  isArmed: boolean;
  onCopyHash: (text: string) => void;
  onToggleArm: () => void;
}

export function VerifiedPlanCard({
  scenario,
  copiedHash,
  isArmed,
  onCopyHash,
  onToggleArm,
}: VerifiedPlanCardProps) {
  const levels = [
    {
      label: 'ENTRY ZONE',
      value: scenario.entry,
      sub: scenario.orderType,
      tone: 'text-fg',
      box: 'border-white/10 bg-black/50',
    },
    {
      label: '1% STOP-LOSS',
      value: scenario.invalidation,
      sub: `Max ${scenario.kellySize}`,
      tone: 'text-bear',
      box: 'border-bear/25 bg-bear/[0.04]',
    },
    {
      label: 'TP1 · LOCK 40%',
      value: scenario.target1,
      sub: '1.5R + Stop to BE',
      tone: 'text-bull',
      box: 'border-bull/20 bg-bull/[0.03]',
    },
    {
      label: 'TP2 · LOCK 35%',
      value: scenario.target2,
      sub: `2.5R (${scenario.rr})`,
      tone: 'text-bull',
      box: 'border-bull/25 bg-bull/[0.05]',
    },
    {
      label: 'TP3 · TRAIL 25%',
      value: scenario.target3,
      sub: `Runner (${scenario.expectedValue})`,
      tone: 'text-brand',
      box: 'border-brand/30 bg-brand/[0.05]',
    },
  ] as const;

  return (
    <m.div
      key={`verdict-card-${scenario.id}`}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.25 }}
      className="border-brand/40 bg-brand/[0.03] rounded-xl border p-5 shadow-xl sm:p-6"
    >
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 border-b border-white/10 pb-4 sm:flex-row sm:items-center">
        <div className="flex items-center gap-3">
          <span className="bg-bull size-3 rounded-full shadow-[0_0_8px_#3f9e3d]" />
          <div>
            <div className="text-fg flex flex-wrap items-center gap-2 font-mono text-sm font-bold uppercase">
              <span>READY-TO-EXECUTE TRADE TICKET</span>
              <span className="text-brand bg-brand/10 border-brand/20 rounded border px-2 py-0.5 font-mono text-[10px]">
                R:R {scenario.rr} · EV {scenario.expectedValue}
              </span>
            </div>
            <div className="text-fg-subtle mt-0.5 font-mono text-[11px]">
              4-PILLAR CONSENSUS ({scenario.consensusScore}%) · SIZED AT {scenario.kellySize}
            </div>
          </div>
        </div>

        <span
          className={cn(
            'shrink-0 rounded-full border px-3 py-1 text-center font-mono text-xs font-bold uppercase',
            scenario.action.startsWith('BUY')
              ? 'text-bull bg-bull/10 border-bull/30'
              : 'text-bear bg-bear/10 border-bear/30',
          )}
        >
          {scenario.action}
        </span>
      </div>

      {/* Unified 5-Level Execution Strip */}
      <div className="mt-5 grid grid-cols-2 gap-2.5 font-mono sm:grid-cols-5">
        {levels.map((lvl) => (
          <div key={lvl.label} className={cn('rounded-lg border p-3 text-center', lvl.box)}>
            <span className="text-fg-subtle block text-[10px] font-bold tracking-wider uppercase">
              {lvl.label}
            </span>
            <span className={cn('mt-1 block text-base font-bold tabular-nums', lvl.tone)}>
              {lvl.value}
            </span>
            <span className="text-fg-muted mt-0.5 block text-[10px]">{lvl.sub}</span>
          </div>
        ))}
      </div>

      {/* Plain-English Verdict & 1-Click Actions */}
      <div className="mt-5 flex flex-col justify-between gap-4 border-t border-white/10 pt-4 sm:flex-row sm:items-center">
        <p className="text-fg-muted max-w-xl font-sans text-xs leading-relaxed">
          &ldquo;{scenario.arbiterVerdict}&rdquo;
        </p>

        <div className="flex flex-wrap items-center gap-2.5">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onCopyHash(scenario.journalSummary)}
            className="gap-1.5 border-white/15 font-mono text-xs"
          >
            {copiedHash ? (
              <>
                <IconCheck className="text-bull size-3.5" />
                Copied Levels
              </>
            ) : (
              <>
                <IconCopy className="size-3.5" />
                Copy Levels
              </>
            )}
          </Button>

          <Button
            variant={isArmed ? 'secondary' : 'tactical'}
            size="sm"
            onClick={onToggleArm}
            className={cn(
              'gap-1.5 font-mono text-xs font-semibold',
              isArmed && 'border-bull/40 bg-bull/15 text-bull hover:bg-bull/20',
            )}
          >
            {isArmed ? (
              <>
                <IconCheck className="size-3.5" />
                Logged & Alerts Armed
              </>
            ) : (
              <>
                <IconBellRinging className="size-3.5" />
                Log Trade & Arm Alerts
              </>
            )}
          </Button>
        </div>
      </div>
    </m.div>
  );
}
