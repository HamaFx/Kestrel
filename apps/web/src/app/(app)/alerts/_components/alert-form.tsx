'use client';

/**
 * Copyright 2026 Kestrel
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import { SYMBOLS, TIMEFRAMES, type Symbol, type Timeframe } from '@kestrel/shared';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Segmented } from '@/components/ui/segmented';
import { apiMutate } from '@/lib/api-client';
import { cn } from '@/lib/cn';
import { AlertCreateSchema } from '@/lib/services/alerts.schema';

import { createAlertAction } from '../actions';

type RuleType = 'priceCross' | 'candleClose' | 'indicatorCross';

const parsedSnoozeHours = (raw: string): number => {
  const n = Number(raw);
  return Number.isFinite(n) ? Math.max(0, Math.min(168, Math.floor(n))) : 0;
};

interface AlertFormProps {
  initialSymbol?: Symbol;
  onCreated?: () => void;
}

const INDICATOR_PRESETS = [
  { value: 'rsi:14', label: 'RSI (14)' },
  { value: 'rsi:7', label: 'RSI (7)' },
  { value: 'ema:20', label: 'EMA (20)' },
  { value: 'ema:50', label: 'EMA (50)' },
  { value: 'ema:200', label: 'EMA (200)' },
  { value: 'sma:50', label: 'SMA (50)' },
  { value: 'sma:200', label: 'SMA (200)' },
  { value: 'atr:14', label: 'ATR (14)' },
  { value: 'macd:12,26,9', label: 'MACD (12, 26, 9)' },
] as const;

function formatIndicatorLabel(raw: string): string {
  const found = INDICATOR_PRESETS.find((p) => p.value === raw.trim().toLowerCase());
  return found ? found.label : raw.toUpperCase();
}

function buildRuleObject(
  type: RuleType,
  symbol: Symbol,
  tf: Timeframe,
  indicator: string,
  level: string,
  direction: 'above' | 'below',
):
  | { type: 'priceCross'; symbol: Symbol; level: number; direction: 'above' | 'below' }
  | {
      type: 'candleClose';
      symbol: Symbol;
      tf: Timeframe;
      level: number;
      direction: 'above' | 'below';
    }
  | {
      type: 'indicatorCross';
      symbol: Symbol;
      tf: Timeframe;
      indicator: string;
      level: number;
      direction: 'above' | 'below';
    }
  | null {
  const numericLevel = level ? Number(level) : NaN;
  if (!Number.isFinite(numericLevel)) return null;
  switch (type) {
    case 'priceCross':
      return { type: 'priceCross', symbol, level: numericLevel, direction };
    case 'candleClose':
      return { type: 'candleClose', symbol, tf, level: numericLevel, direction };
    case 'indicatorCross':
      return { type: 'indicatorCross', symbol, tf, indicator, level: numericLevel, direction };
  }
}

export function AlertForm({ initialSymbol, onCreated }: AlertFormProps) {
  const [type, setType] = useState<RuleType>('priceCross');
  const [symbol, setSymbol] = useState<Symbol>(initialSymbol ?? 'XAUUSD');
  const [tf, setTf] = useState<Timeframe>('1h');
  const [indicator, setIndicator] = useState<string>('rsi:14');
  const [direction, setDirection] = useState<'above' | 'below'>('above');
  const [level, setLevel] = useState<string>('');
  const [note, setNote] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);

  const [touched, setTouched] = useState<Set<string>>(new Set());
  const touch = (field: string) => setTouched((prev) => new Set(prev).add(field));

  const [channels, setChannels] = useState<('email' | 'telegram')[]>(['email']);
  const [snoozeHours, setSnoozeHours] = useState<string>('');

  const fieldErrors = useMemo(() => {
    const errs: Record<string, string | null> = {};
    const levelNum = Number(level);
    if (touched.has('level')) {
      if (!level) errs.level = 'Level is required';
      else if (!Number.isFinite(levelNum) || levelNum <= 0)
        errs.level = 'Enter a valid positive number';
    }
    if (type === 'indicatorCross' && touched.has('indicator')) {
      if (!indicator.trim()) errs.indicator = 'Indicator is required';
    }
    if (touched.has('channels') && channels.length === 0) {
      errs.channels = 'Select at least one delivery method';
    }
    if (touched.has('note') && note.length > 280) {
      errs.note = 'Note must be under 280 characters';
    }
    return errs;
  }, [level, indicator, channels, note, touched, type]);

  async function testAlert() {
    setTesting(true);
    setError(null);
    setTouched(new Set(['level', 'indicator', 'channels']));
    const ruleObj = buildRuleObject(type, symbol, tf, indicator, level, direction);
    if (!ruleObj) {
      setTesting(false);
      setError('Enter a valid level');
      return;
    }
    const validation = AlertCreateSchema.safeParse({
      rule: ruleObj,
      channels,
      note: note.trim() || null,
      snoozeHours: parsedSnoozeHours(snoozeHours),
    });
    if (!validation.success) {
      setTesting(false);
      setError(validation.error.errors[0]?.message ?? 'Invalid input');
      return;
    }
    try {
      const data = await apiMutate<{ count?: number; unsupported?: boolean }>(
        '/api/alerts/preview',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ rule: validation.data.rule, lookbackDays: 90 }),
        },
      );
      if (data.unsupported) {
        toast.success('Alert rule verified', {
          description: `Triggers when ${symbol} (${tf.toUpperCase()}) ${formatIndicatorLabel(indicator)} crosses ${direction} ${level}`,
        });
      } else {
        const count = data.count ?? 0;
        toast.success('Alert rule verified', {
          description:
            count > 0
              ? `Would have triggered ${count} time${count === 1 ? '' : 's'} in the last 90 days`
              : 'Rule is valid (no historical triggers in the last 90 days)',
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Test failed';
      toast.error('Test failed', { description: message });
      setError(message);
    } finally {
      setTesting(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const ruleObj = buildRuleObject(type, symbol, tf, indicator, level, direction);
    if (!ruleObj) {
      setSubmitting(false);
      setError('Enter a valid level');
      return;
    }

    const validation = AlertCreateSchema.safeParse({
      rule: ruleObj,
      channels,
      note: note.trim() || null,
      snoozeHours: parsedSnoozeHours(snoozeHours),
    });

    if (!validation.success) {
      setSubmitting(false);
      setError(validation.error.errors[0]?.message ?? 'Invalid input');
      return;
    }

    const data = validation.data;

    try {
      const res = await createAlertAction({
        rule: data.rule,
        channels: data.channels,
        note: data.note,
        snoozeHours: data.snoozeHours,
      });
      if (!res.ok) {
        throw new Error(res.error ?? 'Create failed');
      }
      setLevel('');
      setNote('');
      toast.success('Alert created', { description: `${symbol} ${direction} ${data.rule.level}` });
      onCreated?.();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Create failed';
      toast.error('Create failed', { description: message });
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 px-4 pb-4">
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

      <Segmented<Symbol>
        label="Symbol"
        value={symbol}
        onChange={setSymbol}
        role="radiogroup"
        variant="solid"
        size="md"
        options={SYMBOLS.map((s) => ({ value: s, label: s }))}
      />

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

      <PreviewCallout
        type={type}
        symbol={symbol}
        tf={tf}
        indicator={indicator}
        direction={direction}
        level={level}
      />

      <fieldset className="flex flex-col gap-2">
        <legend className="text-fg-subtle text-body-sm tracking-wide uppercase">
          Delivery Methods
        </legend>
        <div className="flex gap-4">
          <label className="text-fg flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="accent-brand size-4 cursor-pointer"
              checked={channels.includes('email')}
              onChange={(e) => {
                const c = 'email';
                setChannels(e.target.checked ? [...channels, c] : channels.filter((x) => x !== c));
              }}
              onBlur={() => touch('channels')}
            />
            Email
          </label>
          <label className="text-fg flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="accent-brand size-4 cursor-pointer"
              checked={channels.includes('telegram')}
              onChange={(e) => {
                const c = 'telegram';
                setChannels(e.target.checked ? [...channels, c] : channels.filter((x) => x !== c));
              }}
              onBlur={() => touch('channels')}
            />
            Telegram
          </label>
        </div>
        {fieldErrors.channels ? (
          <p id="alert-channels-error" role="alert" className="text-danger text-xs">
            {fieldErrors.channels}
          </p>
        ) : null}
      </fieldset>

      <div className="flex flex-col gap-2">
        <label className="text-fg-subtle text-body-sm tracking-wide uppercase" htmlFor="alert-note">
          Note (optional)
        </label>
        <Input
          id="alert-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => touch('note')}
          placeholder="Why am I watching this level?"
          maxLength={280}
          {...(fieldErrors.note ? { 'aria-describedby': 'alert-note-error' } : {})}
        />
        {fieldErrors.note ? (
          <p id="alert-note-error" role="alert" className="text-danger text-xs">
            {fieldErrors.note}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <label
          className="text-fg-subtle text-body-sm tracking-wide uppercase"
          htmlFor="alert-snooze"
        >
          Re-arm after (hours, 0 = one-shot)
        </label>
        <Input
          id="alert-snooze"
          type="number"
          min={0}
          max={168}
          step={1}
          value={snoozeHours}
          onChange={(e) => setSnoozeHours(e.target.value)}
          placeholder="Leave empty for one-shot trigger"
        />
      </div>

      {error ? (
        <p id="alert-form-error" role="alert" className="text-danger text-sm">
          {error}
        </p>
      ) : null}

      <div className="mt-2 flex flex-col gap-2">
        <Button
          type="submit"
          disabled={submitting || !level}
          size="lg"
          loading={submitting}
          className="w-full"
        >
          {submitting ? 'Creating…' : 'Create alert'}
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={testing || !level}
          loading={testing}
          onClick={() => void testAlert()}
          className="w-full"
        >
          {testing ? 'Checking…' : 'Verify Alert Rule'}
        </Button>
      </div>
    </form>
  );
}

interface PreviewCalloutProps {
  type: RuleType;
  symbol: Symbol;
  tf: Timeframe;
  indicator: string;
  direction: 'above' | 'below';
  level: string;
}

type PreviewState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'indicator_summary' }
  | { kind: 'empty' }
  | { kind: 'ok'; count: number; avgHoldMs: number };

function PreviewCallout(props: PreviewCalloutProps) {
  const [state, setState] = useState<PreviewState>({ kind: 'idle' });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { type, symbol, tf, indicator, direction, level } = props;

  useEffect(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const rule = buildRuleObject(type, symbol, tf, indicator, level, direction);
    if (!rule) {
      setState({ kind: 'idle' });
      return;
    }
    if (type === 'indicatorCross') {
      setState({ kind: 'indicator_summary' });
      return;
    }
    setState({ kind: 'loading' });
    timerRef.current = setTimeout(async () => {
      try {
        const data = await apiMutate<{
          count?: number;
          avgHoldMs?: number;
          unsupported?: boolean;
        }>('/api/alerts/preview', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ rule, lookbackDays: 90 }),
        });
        if (data.unsupported) {
          setState({ kind: 'indicator_summary' });
          return;
        }
        if (typeof data.count !== 'number' || data.count === 0) {
          setState({ kind: 'empty' });
          return;
        }
        setState({
          kind: 'ok',
          count: data.count,
          avgHoldMs: typeof data.avgHoldMs === 'number' ? data.avgHoldMs : 0,
        });
      } catch {
        setState({ kind: 'empty' });
      }
    }, 400);
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [type, symbol, tf, indicator, direction, level]);

  if (state.kind === 'idle' || state.kind === 'loading') return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'text-body-sm rounded-sm border p-3',
        state.kind === 'ok' || state.kind === 'indicator_summary'
          ? 'border-info/30 bg-info/10 text-fg-muted'
          : 'border-border bg-bg-elev-1/40 text-fg-subtle',
      )}
    >
      {state.kind === 'indicator_summary' ? (
        <p>
          Triggers when <span className="text-fg font-semibold">{symbol}</span> ({tf.toUpperCase()}){' '}
          <span className="text-fg font-semibold">{formatIndicatorLabel(indicator)}</span> crosses{' '}
          {direction} <span className="text-fg font-mono font-semibold">{level}</span>.
        </p>
      ) : state.kind === 'empty' ? (
        <p>No historical triggers in the last 90 days for this level.</p>
      ) : (
        <p>
          Would have triggered{' '}
          <span className="text-fg font-semibold tabular-nums">{state.count}</span> time
          {state.count === 1 ? '' : 's'} in the last 90 days.
          {state.avgHoldMs > 0 ? (
            <>
              {' '}
              Average hold:{' '}
              <span className="text-fg tabular-nums">{formatDuration(state.avgHoldMs)}</span>.
            </>
          ) : null}
        </p>
      )}
    </div>
  );
}

function formatDuration(ms: number): string {
  const min = Math.round(ms / 60_000);
  if (min < 60) return `${min}m`;
  const hr = Math.round(min / 60);
  if (hr < 48) return `${hr}h`;
  const day = Math.round(hr / 24);
  return `${day}d`;
}
