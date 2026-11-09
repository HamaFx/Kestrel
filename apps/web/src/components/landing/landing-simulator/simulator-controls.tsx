'use client';

// SPDX-License-Identifier: Apache-2.0

// Interactive 1.0% Risk Guardrail slider + 1-tap presets for the landing simulator.
import { IconAlertTriangle, IconShieldCheck } from '@tabler/icons-react';
import { m } from 'motion/react';

import { cn } from '@/lib/formatters/cn';

interface SimulatorControlsProps {
  riskSlider: number;
  isVetoed: boolean;
  onRiskChange: (value: number) => void;
  onRestoreLimit: () => void;
}

const PRESET_RISKS = [
  { label: '0.5% Conservative', value: 0.5, safe: true },
  { label: '1.0% Max Cap', value: 1.0, safe: true },
  { label: '2.0% Over-Leveraged (Test Veto)', value: 2.0, safe: false },
] as const;

export function SimulatorControls({
  riskSlider,
  isVetoed,
  onRiskChange,
  onRestoreLimit,
}: SimulatorControlsProps) {
  const riskDollars = Math.round(100_000 * (riskSlider / 100));

  return (
    <div
      className={cn(
        'surface-well my-6 rounded-xl border p-4 transition-all duration-300 sm:p-5',
        isVetoed
          ? 'border-bear/50 bg-bear/[0.06] shadow-[0_0_28px_rgba(224,44,16,0.16)]'
          : 'border-white/10 bg-[#090a0b]',
      )}
    >
      <div className="mb-3 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <span className="text-fg flex items-center gap-2 font-mono text-xs font-bold tracking-wider uppercase">
            <IconShieldCheck className={cn('size-4', isVetoed ? 'text-bear' : 'text-bull')} />
            TRY IT LIVE: 1.0% HARD RISK BLOCKER
          </span>
          <span className="text-fg-muted mt-0.5 block font-sans text-xs">
            Push the slider above 1.0% (or tap a preset) to watch Kestrel automatically block an
            oversized trade.
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {PRESET_RISKS.map((preset) => {
            const active = Math.abs(riskSlider - preset.value) < 0.05;
            return (
              <button
                key={preset.label}
                type="button"
                onClick={() => onRiskChange(preset.value)}
                className={cn(
                  'cursor-pointer rounded-lg border px-2.5 py-1 font-mono text-[10px] font-bold transition-all',
                  active
                    ? preset.safe
                      ? 'border-bull/50 bg-bull/15 text-bull'
                      : 'border-bear/60 bg-bear/20 text-bear'
                    : 'text-fg-muted hover:text-fg border-white/10 bg-white/[0.03] hover:border-white/20',
                )}
              >
                {preset.label}
              </button>
            );
          })}
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
        <div className="shrink-0 text-right font-mono text-xs font-bold">
          <span
            className={cn(
              'font-mono font-black tabular-nums',
              isVetoed ? 'text-bear' : 'text-bull',
            )}
          >
            {riskSlider.toFixed(1)}%
          </span>{' '}
          <span className={cn('tabular-nums', isVetoed ? 'text-bear' : 'text-fg-muted')}>
            (${riskDollars.toLocaleString('en-US')})
          </span>
        </div>
      </div>

      {isVetoed && (
        <m.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-bear/15 border-bear/40 text-bear mt-3.5 flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 font-mono text-xs"
        >
          <div className="flex items-center gap-2">
            <IconAlertTriangle className="size-4 shrink-0" />
            <span>
              <strong>TRADE VETOED:</strong> {riskSlider.toFixed(1)}% risk breaks your 1.0% safety
              cap. Execution locked until sized down.
            </span>
          </div>
          <button
            type="button"
            onClick={onRestoreLimit}
            className="bg-bear/20 hover:bg-bear/30 border-bear/40 cursor-pointer rounded border px-2.5 py-1 text-[11px] font-bold underline transition-colors"
          >
            Snap Back to 1.0%
          </button>
        </m.div>
      )}
    </div>
  );
}
