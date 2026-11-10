'use client';

// SPDX-License-Identifier: Apache-2.0

// The Arbiter's Seal — deterministic position sizer that turns a certified
// 4-desk dossier into a one-click execution ticket. Holding the seal logs the
// trade to /api/journal and arms invalidation + target price alerts through
// /api/alerts, all from the chat card.
import { getSymbolDefinition, isSymbol, priceDecimals, type Symbol } from '@kestrel/shared';
import { IconSettings, IconShieldLock } from '@tabler/icons-react';
import { useState } from 'react';

import { HoldToExecuteButton } from '@/components/ui/hold-to-execute-button';
import { Kpi, KpiGroup, KpiLabel, KpiValue } from '@/components/ui/kpi';
import { Slider } from '@/components/ui/slider';
import { useLocalStorage } from '@/hooks/use-local-storage';
import { cn } from '@/lib/formatters/cn';

import type { ExtractedTradeLevels } from './extract-trade-levels';
import { useArbiterSeal } from './use-arbiter-seal';

const EQUITY_KEY = 'kestrel:sizer-equity:v1';
const RISK_KEY = 'kestrel:sizer-risk-pct:v1';
const RISK_OPTIONS = [0.25, 0.5, 0.75, 1.0] as const;
const EQUITY_MIN = 1_000;
const EQUITY_MAX = 10_000_000;

const parseLevel = (value: string): number | null => {
  const parsed = Number(value.replace(/,/g, '').trim());
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const formatPrice = (value: number, symbol: Symbol) =>
  value.toLocaleString('en-US', {
    minimumFractionDigits: priceDecimals(symbol),
    maximumFractionDigits: priceDecimals(symbol),
  });

interface ArbiterSealSizerProps {
  symbol: string | null;
  planId: string;
  levels: ExtractedTradeLevels;
  /** Dock panel renders the sizer expanded by default. */
  defaultOpen?: boolean;
}

export function ArbiterSealSizer({
  symbol,
  planId,
  levels,
  defaultOpen = false,
}: ArbiterSealSizerProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [equity, setEquity] = useLocalStorage<number>(EQUITY_KEY, 10_000);
  const [riskPct, setRiskPct] = useLocalStorage<number>(RISK_KEY, 1.0);

  const entryNum = parseLevel(levels.entry);
  const slNum = parseLevel(levels.invalidation);
  const tp1Num = parseLevel(levels.tp1);
  const tp2Num = parseLevel(levels.tp2);
  const validSymbol = symbol !== null && isSymbol(symbol);
  const canSize =
    validSymbol &&
    entryNum !== null &&
    slNum !== null &&
    entryNum !== slNum &&
    levels.direction !== 'NEUTRAL';

  const sizingSymbol = validSymbol ? symbol : 'XAUUSD';
  const definition = getSymbolDefinition(sizingSymbol);
  const contractSize = definition.capabilities.contractSize;
  const stopDistance = entryNum !== null && slNum !== null ? Math.abs(entryNum - slNum) : 0;
  const riskCapPct = levels.dissent ? 0.5 : 1.0;
  const effectiveRiskPct = Math.min(Math.max(riskPct, 0.1), riskCapPct);
  const riskDollars = equity * (effectiveRiskPct / 100);
  const units = stopDistance > 0 ? riskDollars / stopDistance : 0;
  const lots = units / contractSize;
  // Crypto and non-USD quote pairs are sized in exact units; USD-quote FX and
  // gold read naturally as standard lots.
  const unitsOnly = definition.category === 'crypto' || definition.quoteCurrency !== 'USD';

  const sizeLabel = unitsOnly
    ? `${units.toFixed(4)} units`
    : `${lots.toFixed(2)} lots (${units.toFixed(1)} units)`;

  const { sealing, sealed, sealPlan } = useArbiterSeal({
    symbol: sizingSymbol,
    planId,
    direction: levels.direction === 'BUY' ? 'BUY' : 'SELL',
    entry: entryNum ?? 0,
    stop: slNum ?? 0,
    tp1: tp1Num,
    tp2: tp2Num,
    sizeLots: lots,
  });

  if (!canSize || !validSymbol || entryNum === null || slNum === null) return null;

  return (
    <div className="border-brand/25 bg-[#0a0b0c] overflow-hidden rounded-xl border">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="focus-visible:ring-brand flex min-h-11 w-full items-center justify-between gap-2 px-3 py-2 text-left transition-colors hover:bg-white/[0.03] focus:outline-none focus-visible:ring-2"
      >
        <span className="text-fg-muted inline-flex items-center gap-2 font-mono text-[11px] font-semibold tracking-wider uppercase">
          <IconSettings className="text-brand size-3.5" />
          Position Size Calculator &amp; Save Trade
        </span>
        <span className="text-fg-subtle font-mono text-[10px] uppercase">
          {open ? 'Hide' : 'Open'}
        </span>
      </button>

      {open ? (
        <div className="border-t border-white/[0.06] p-3">
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-fg-subtle font-mono text-[10px] tracking-wider uppercase">
                Account equity (USD)
              </span>
              <input
                type="number"
                min={EQUITY_MIN}
                max={EQUITY_MAX}
                step={500}
                value={equity}
                onChange={(event) => {
                  const next = Number(event.target.value);
                  if (Number.isFinite(next)) {
                    setEquity(Math.min(EQUITY_MAX, Math.max(EQUITY_MIN, next)));
                  }
                }}
                className="surface-well focus:border-brand/50 text-fg h-9 rounded-lg border border-white/[0.08] bg-[#090a0b] px-2.5 font-mono text-xs tabular-nums outline-none"
              />
            </label>
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <span className="text-fg-subtle font-mono text-[10px] tracking-wider uppercase">
                  Risk per trade
                </span>
                <div className="flex gap-1">
                  {RISK_OPTIONS.map((option) => {
                    const disabled = option > riskCapPct;
                    const active = Math.abs(effectiveRiskPct - option) < 0.01;
                    return (
                      <button
                        key={option}
                        type="button"
                        disabled={disabled}
                        onClick={() => setRiskPct(option)}
                        className={cn(
                          'rounded border px-1.5 py-0.5 font-mono text-[9px] font-semibold tabular-nums transition-colors',
                          active
                            ? 'border-brand/50 bg-brand/15 text-brand'
                            : 'text-fg-subtle border-white/[0.08] bg-white/[0.02] hover:text-fg',
                          disabled && 'cursor-not-allowed opacity-30',
                        )}
                        title={
                          disabled ? 'Risk is capped at 0.5% when signals disagree' : undefined
                        }
                      >
                        {option.toFixed(2)}%
                      </button>
                    );
                  })}
                </div>
              </div>
              <Slider
                label="Risk"
                valueLabel={`${effectiveRiskPct.toFixed(2)}%`}
                ariaLabel="Risk per trade percentage"
                value={effectiveRiskPct}
                min={0.1}
                max={riskCapPct}
                step={0.05}
                tone="brand"
                onValueChange={setRiskPct}
              />
            </div>
          </div>

          <KpiGroup cols={3} className="mt-2.5">
            <Kpi className="px-2.5 py-2">
              <KpiLabel>Stop distance</KpiLabel>
              <KpiValue className="text-xs sm:text-xs">
                {formatPrice(stopDistance, sizingSymbol)}
              </KpiValue>
            </Kpi>
            <Kpi className="px-2.5 py-2">
              <KpiLabel>Max risk</KpiLabel>
              <KpiValue tone="warn" className="text-xs sm:text-xs">
                ${riskDollars.toLocaleString('en-US', { maximumFractionDigits: 2 })}
              </KpiValue>
            </Kpi>
            <Kpi className="px-2.5 py-2">
              <KpiLabel>Position size</KpiLabel>
              <KpiValue className="truncate text-xs sm:text-xs">{sizeLabel}</KpiValue>
            </Kpi>
          </KpiGroup>

          <div className="mt-2.5">
            {levels.isVetoed ? (
              <div className="border-danger/30 bg-danger/[0.06] text-danger flex min-h-11 items-center justify-center gap-2 rounded-xl border px-3 text-center font-mono text-[10px] font-bold tracking-wider uppercase">
                <IconShieldLock className="size-4 shrink-0" />
                Blocked by 1.0% risk guardrail
              </div>
            ) : sealed ? (
              <div className="border-bull/30 bg-bull/[0.08] text-bull flex min-h-11 items-center justify-center rounded-xl border px-3 font-mono text-[10px] font-bold tracking-wider uppercase">
                Saved · {planId}
              </div>
            ) : (
              <HoldToExecuteButton
                onExecute={sealPlan}
                holdDurationMs={1000}
                variant={levels.direction === 'BUY' ? 'bull' : 'bear'}
                disabled={sealing || lots <= 0}
                label="Hold to Log Trade & Set Price Alerts"
                executingLabel="Saving trade…"
                completedLabel={`Saved · ${planId}`}
                className="w-full"
              />
            )}
          </div>

          <p className="text-fg-subtle/70 mt-2 font-mono text-[10px] leading-relaxed">
            {levels.dissent
              ? 'Signals are mixed · risk is capped at 0.50% for safety.'
              : '1.00% maximum risk guardrail active · logs trade to Journal and sets price alerts.'}
          </p>
        </div>
      ) : null}
    </div>
  );
}
