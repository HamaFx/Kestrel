'use client';

// SPDX-License-Identifier: Apache-2.0

// Risk tolerance slider and the veto governor for the landing simulator.
import { IconAlertTriangle, IconLock } from '@tabler/icons-react';
import { m } from 'motion/react';

import { cn } from '@/lib/formatters/cn';

interface SimulatorControlsProps {
  riskSlider: number;
  isVetoed: boolean;
  onRiskChange: (value: number) => void;
  onRestoreLimit: () => void;
}

export function SimulatorControls({
  riskSlider,
  isVetoed,
  onRiskChange,
  onRestoreLimit,
}: SimulatorControlsProps) {
  return (
    <div
      className={cn(
        'surface-well my-6 rounded-xl border p-4 transition-all duration-300 sm:p-5',
        isVetoed
          ? 'border-bear/50 bg-bear/[0.05] shadow-[0_0_20px_rgba(224,44,16,0.15)]'
          : 'border-white/10 bg-[#090a0b]',
      )}
    >
      <div className="mb-3 flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
        <div>
          <span className="text-fg flex items-center gap-2 font-mono text-xs font-bold tracking-wider uppercase">
            <IconLock className="text-brand size-3.5" />
            PORTFOLIO RISK GUARDRAIL (1.0% MAX LOSS)
          </span>
          <span className="text-fg-muted mt-0.5 block font-sans text-xs">
            Drag the slider above 1.0% to see how Kestrel blocks oversized risk before you place a
            trade.
          </span>
        </div>
        <div className="shrink-0 font-mono text-xs font-bold">
          RISK PER TRADE:{' '}
          <span
            className={cn(
              'font-mono font-black tabular-nums',
              isVetoed ? 'text-bear' : 'text-bull',
            )}
          >
            {riskSlider.toFixed(1)}%
          </span>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <span className="text-fg-subtle font-mono text-xs">0.5%</span>
        <input
          type="range"
          min="0.5"
          max="2.5"
          step="0.1"
          value={riskSlider}
          aria-label="Max account risk percentage"
          aria-valuemin={0.5}
          aria-valuemax={2.5}
          aria-valuenow={riskSlider}
          onChange={(e) => onRiskChange(parseFloat(e.target.value))}
          className="accent-brand w-full cursor-pointer"
        />
        <span className="text-fg-subtle font-mono text-xs">2.5%</span>
      </div>

      {isVetoed && (
        <m.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-bear/15 border-bear/40 text-bear mt-3.5 flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 font-mono text-xs"
        >
          <div className="flex items-center gap-2">
            <IconAlertTriangle className="size-4 shrink-0 animate-bounce" />
            <span>
              <strong>RISK GUARDRAIL TRIGGERED:</strong> {riskSlider.toFixed(1)}% risk exceeds your
              1.0% maximum drawdown rule. Trade plan paused.
            </span>
          </div>
          <button
            type="button"
            onClick={onRestoreLimit}
            className="bg-bear/20 hover:bg-bear/30 border-bear/40 cursor-pointer rounded border px-2.5 py-1 text-[11px] font-bold underline transition-colors"
          >
            Restore 1.0% Limit
          </button>
        </m.div>
      )}
    </div>
  );
}
