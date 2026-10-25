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

// Sandbox payload/output shapes and the strategy-signal normaliser.

import type { FeatureMatrix, SeriesName } from '../features';
import type { GeneratedSignal, SandboxLimits, TradeSide, TrailingMode } from '../types';

export interface SandboxPayload {
  symbol: string;
  timeframe: string;
  bars: FeatureMatrix['bars'];
  series: FeatureMatrix['series'];
  seriesNames: readonly SeriesName[];
  smc: FeatureMatrix['smc'];
  params: Record<string, unknown>;
  limits: Pick<SandboxLimits, 'maxLogs' | 'maxSignals'>;
}

export interface RawSandboxOutput {
  signals: unknown;
  logs: unknown;
  bars: unknown;
}

export function describeDump(dump: unknown): string {
  if (typeof dump === 'string') return dump;
  if (dump && typeof dump === 'object') {
    const record = dump as Record<string, unknown>;
    const message = record['message'];
    const stack = record['stack'];
    if (typeof message === 'string') {
      return typeof stack === 'string' && stack.length > 0 ? `${message}\n${stack}` : message;
    }
    try {
      return JSON.stringify(dump);
    } catch {
      return String(dump);
    }
  }
  return String(dump);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function toSignal(value: unknown): GeneratedSignal | null {
  if (!isRecord(value)) return null;
  const side = value['side'];
  const stop = value['stop'];
  const entry = value['entry'];
  const signalIndex = value['signalIndex'];
  const signalTime = value['signalTime'];
  if (side !== 'long' && side !== 'short') return null;
  if (typeof stop !== 'number' || !Number.isFinite(stop) || stop <= 0) return null;
  if (typeof signalIndex !== 'number' || !Number.isInteger(signalIndex) || signalIndex < 0) {
    return null;
  }
  if (typeof signalTime !== 'number' || !Number.isFinite(signalTime)) return null;
  if (typeof entry !== 'number' && entry !== 'market') return null;

  const signal: GeneratedSignal = {
    side: side as TradeSide,
    entry: entry === 'market' ? 'market' : entry,
    stop,
    signalIndex,
    signalTime,
  };

  const target = value['target'];
  if (typeof target === 'number' && Number.isFinite(target) && target > 0) signal.target = target;

  for (const key of ['riskPct', 'maxBars', 'validBars', 'breakEvenAtR'] as const) {
    const raw = value[key];
    if (typeof raw === 'number' && Number.isFinite(raw)) {
      if (key === 'riskPct' || key === 'breakEvenAtR') signal[key] = raw;
      else signal[key] = Math.max(1, Math.floor(raw));
    }
  }

  const trailing = value['trailing'];
  if (isRecord(trailing)) {
    const type = trailing['type'];
    const trailingValue = trailing['value'];
    if (
      (type === 'atr' || type === 'percent' || type === 'fixed') &&
      typeof trailingValue === 'number' &&
      Number.isFinite(trailingValue) &&
      trailingValue > 0
    ) {
      signal.trailing = { type: type as TrailingMode, value: trailingValue };
    }
  }

  const reason = value['reason'];
  if (typeof reason === 'string' && reason.length > 0) signal.reason = reason.slice(0, 200);

  const tags = value['tags'];
  if (Array.isArray(tags)) {
    const clean = tags
      .filter((tag): tag is string => typeof tag === 'string' && tag.length > 0)
      .map((tag) => tag.slice(0, 40))
      .slice(0, 10);
    if (clean.length > 0) signal.tags = clean;
  }

  return signal;
}
