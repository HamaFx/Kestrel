'use client';

// SPDX-License-Identifier: Apache-2.0

// Debounced historical-trigger preview callout for the alert rule.
import type { Symbol, Timeframe } from '@kestrel/shared';
import { useEffect, useRef, useState } from 'react';

import { cn } from '@/lib/formatters/cn';
import { apiMutate } from '@/lib/http/api-client';

import {
  buildRuleObject,
  formatDuration,
  formatIndicatorLabel,
  type RuleType,
} from './rule-helpers';

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

export function PreviewCallout(props: PreviewCalloutProps) {
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
