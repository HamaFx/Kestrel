'use client';

// SPDX-License-Identifier: Apache-2.0

// State + actions for the alert creation form: rule fields, delivery
// channels (including plugin-provided ones), validation, test, and submit.
import { type Symbol, type Timeframe } from '@kestrel/shared';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { apiFetch, apiMutate } from '@/lib/http/api-client';
import type { PluginStoreSnapshot } from '@/lib/plugins/types';
import { AlertCreateSchema } from '@/lib/services/alerts.schema';

import { createAlertAction } from '../../actions';
import {
  buildRuleObject,
  formatIndicatorLabel,
  parsedSnoozeHours,
  type RuleType,
} from './rule-helpers';

interface AlertFormProps {
  initialSymbol?: Symbol;
  onCreated?: () => void;
}

export function useAlertForm({ initialSymbol, onCreated }: AlertFormProps) {
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

  const [channels, setChannels] = useState<string[]>(['email']);
  const [pluginChannels, setPluginChannels] = useState<Array<{ id: string; label: string }>>([]);
  const [snoozeHours, setSnoozeHours] = useState<string>('');

  // The Telegram plugin delivers through the user's own bot. Surface that
  // channel only when the plugin is installed + enabled.
  useEffect(() => {
    let cancelled = false;
    apiFetch<PluginStoreSnapshot>('/api/plugins/manage')
      .then((snapshot) => {
        if (cancelled) return;
        const telegram = snapshot.plugins.find((plugin) => plugin.id === 'telegram-bot');
        if (telegram?.installed && telegram.enabled && telegram.onboardingCompleted) {
          setPluginChannels([{ id: 'telegram-bot', label: 'Telegram (personal bot)' }]);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

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
      setError(validation.error.issues[0]?.message ?? 'Invalid input');
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
      setError(validation.error.issues[0]?.message ?? 'Invalid input');
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

  return {
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
    note,
    setNote,
    submitting,
    error,
    testing,
    touch,
    channels,
    setChannels,
    pluginChannels,
    snoozeHours,
    setSnoozeHours,
    fieldErrors,
    testAlert,
    submit,
  };
}

export type AlertFormController = ReturnType<typeof useAlertForm>;
