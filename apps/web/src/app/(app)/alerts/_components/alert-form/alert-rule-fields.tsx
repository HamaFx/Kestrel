'use client';

// SPDX-License-Identifier: Apache-2.0

// Rule fields for the alert form: type, symbol, timeframe, indicator,
// direction, and the trigger level.
import {
  DEFAULT_WATCHLIST_SYMBOLS,
  SYMBOLS,
  TIMEFRAMES,
  type Symbol,
  type Timeframe,
} from '@kestrel/shared';

import { Input } from '@/components/ui/input';
import { Segmented } from '@/components/ui/segmented';
import { Select } from '@/components/ui/select';
import { cn } from '@/lib/formatters/cn';

import { INDICATOR_PRESETS, type RuleType } from './rule-helpers';
import type { AlertFormController } from './use-alert-form';

export function AlertRuleFields({ controller }: { controller: AlertFormController }) {
  const {
    type,
    setType,
    symbol,
    setSymbol,
    tf,
    setTf,
    indicator,
    setIndicator,
    direction,
    setDirection,
    level,
    setLevel,
    touch,
    fieldErrors,
  } = controller;

  return (
    <>
      <Segmented<RuleType>
        label="When"
        value={type}
        onChange={setType}
        role="radiogroup"
        variant="solid"
        size="md"
        options={[
          { value: 'priceCross', label: 'Price Level' },
          { value: 'candleClose', label: 'Candle Close' },
          { value: 'indicatorCross', label: 'Technical Indicator' },
        ]}
      />

      <div className="flex flex-col gap-2">
        <Select
          label="Symbol"
          value={symbol}
          onChange={(e) => setSymbol(e.target.value as Symbol)}
        >
          {SYMBOLS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-fg-subtle font-mono text-[10px] uppercase">Quick pick:</span>
          {DEFAULT_WATCHLIST_SYMBOLS.map((s) => {
            const active = symbol === s;
            return (
              <button
                key={s}
                type="button"
                onClick={() => setSymbol(s)}
                className={cn(
                  'rounded-md border px-2 py-0.5 font-mono text-[11px] font-semibold transition-colors',
                  active
                    ? 'border-brand/50 bg-brand/15 text-brand'
                    : 'border-white/10 bg-white/[0.03] text-fg-muted hover:text-fg',
                )}
              >
                {s}
              </button>
            );
          })}
        </div>
      </div>

      {type !== 'priceCross' ? (
        <Segmented<Timeframe>
          label="Timeframe"
          value={tf}
          onChange={setTf}
          role="radiogroup"
          variant="solid"
          size="md"
          options={TIMEFRAMES.map((t) => ({ value: t, label: t.toUpperCase() }))}
        />
      ) : null}

      {type === 'indicatorCross' ? (
        <div className="flex flex-col gap-2">
          <label
            htmlFor="alert-indicator"
            className="text-fg-subtle text-body-sm tracking-wide uppercase"
          >
            Select Indicator
          </label>
          <div className="flex flex-wrap gap-1.5">
            {INDICATOR_PRESETS.map((preset) => (
              <button
                key={preset.value}
                type="button"
                onClick={() => setIndicator(preset.value)}
                className={cn(
                  'border-border inline-flex min-h-[40px] items-center justify-center rounded-md border px-3 text-xs font-medium transition-colors',
                  indicator === preset.value
                    ? 'bg-brand/15 border-brand/40 text-brand font-semibold'
                    : 'bg-bg-elev-2 text-fg-muted hover:text-fg',
                )}
              >
                {preset.label}
              </button>
            ))}
          </div>
          <Input
            id="alert-indicator"
            value={indicator}
            onChange={(e) => setIndicator(e.target.value)}
            onBlur={() => touch('indicator')}
            placeholder="Custom indicator (e.g. rsi:14, ema:50)"
            {...(fieldErrors.indicator ? { 'aria-describedby': 'alert-indicator-error' } : {})}
          />
          {fieldErrors.indicator ? (
            <p id="alert-indicator-error" role="alert" className="text-danger text-xs">
              {fieldErrors.indicator}
            </p>
          ) : null}
        </div>
      ) : null}

      <Segmented
        label="Direction"
        value={direction}
        onChange={setDirection}
        role="radiogroup"
        variant="solid"
        size="md"
        options={[
          { value: 'above', label: 'Crosses Above ↑' },
          { value: 'below', label: 'Crosses Below ↓' },
        ]}
      />

      <div className="flex flex-col gap-2">
        <label
          className="text-fg-subtle text-body-sm tracking-wide uppercase"
          htmlFor="alert-level"
        >
          Trigger Value / Price
        </label>
        <Input
          id="alert-level"
          value={level}
          onChange={(e) => setLevel(e.target.value)}
          onBlur={() => touch('level')}
          inputMode="decimal"
          placeholder={
            type === 'indicatorCross' && indicator.startsWith('rsi')
              ? 'e.g. 30 or 70'
              : symbol === 'XAUUSD'
                ? 'e.g. 2850.00'
                : 'e.g. 1.0850'
          }
          {...(fieldErrors.level ? { 'aria-describedby': 'alert-level-error' } : {})}
        />
        {fieldErrors.level ? (
          <p id="alert-level-error" role="alert" className="text-danger text-xs">
            {fieldErrors.level}
          </p>
        ) : null}
      </div>
    </>
  );
}
