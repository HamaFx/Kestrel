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

// QuickJS strategy sandbox.
//
// Agent-authored `getSignal(ctx)` code runs in a WebAssembly QuickJS runtime
// with:
//   * no host globals (no require, process, fetch, fs, or module loader)
//   * a hard memory limit and stack limit
//   * a wall-clock interrupt handler (runaway loops are interrupted)
//   * a point-in-time feature view; `series(name, offset)` rejects offset > 0
//
// The strategy loops over bars *inside* the sandbox, so a 5,000-bar backtest
// crosses the WASM boundary once, not 5,000 times. The engine owns execution:
// a strategy can only describe intent, never fill prices or timestamps.

import type { QuickJSWASMModule } from 'quickjs-emscripten';

import { SERIES_NAMES, type FeatureMatrix, type SeriesName } from './features';
import type {
  GeneratedSignal,
  SandboxLimits,
  StrategySandboxResult,
  StrategySignal,
  TradeSide,
  TrailingMode,
} from './types';

export const DEFAULT_SANDBOX_LIMITS: SandboxLimits = {
  maxSignals: 2_000,
  maxLogs: 200,
  timeoutMs: 5_000,
  memoryBytes: 96 * 1024 * 1024,
  stackBytes: 1024 * 1024,
};

export class StrategySandboxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StrategySandboxError';
  }
}

const DRIVER = String.raw`
function __kestrelSession(ms) {
  var d = new Date(ms);
  var hour = d.getUTCHours();
  var minute = d.getUTCMinutes();
  var day = d.getUTCDay();
  var isAsian = hour < 7;
  var isLondon = hour >= 7 && hour < 16;
  var isNewYork = hour >= 12 && hour < 21;
  return {
    hourUtc: hour,
    minuteUtc: minute,
    dayOfWeek: day,
    asian: isAsian,
    london: isLondon,
    newYork: isNewYork,
    overlap: hour >= 12 && hour < 16,
    londonOpenKillzone: hour >= 7 && hour < 10,
    newYorkOpenKillzone: hour >= 12 && hour < 15,
    weekend: day === 0 || day === 6
  };
}

function __kestrelZone(top, bottom, age, strength) {
  if (!top || !bottom) return null;
  var zone = { top: top, bottom: bottom, age: age };
  if (strength !== undefined) zone.strength = strength;
  return zone;
}

function __kestrelSmc(i) {
  var s = __KP.smc;
  var sweep = s.sweepSide[i] ? {
    side: s.sweepSide[i] > 0 ? 'high' : 'low',
    level: s.sweepLevel[i],
    wick: s.sweepWick[i],
    magnitude: s.sweepMagnitude[i],
    age: s.sweepAge[i]
  } : null;
  var structure = s.structureDirection[i] ? {
    direction: s.structureDirection[i] > 0 ? 'bullish' : 'bearish',
    kind: s.structureKind[i] === 1 ? 'bos' : 'choch',
    level: s.structureLevel[i],
    age: s.structureAge[i]
  } : null;
  return {
    fvg: {
      bullish: __kestrelZone(s.fvgBullTop[i], s.fvgBullBottom[i], s.fvgBullAge[i]),
      bearish: __kestrelZone(s.fvgBearTop[i], s.fvgBearBottom[i], s.fvgBearAge[i])
    },
    orderBlock: {
      bullish: __kestrelZone(s.obBullTop[i], s.obBullBottom[i], s.obBullAge[i], s.obBullStrength[i]),
      bearish: __kestrelZone(s.obBearTop[i], s.obBearBottom[i], s.obBearAge[i], s.obBearStrength[i])
    },
    sweep: sweep,
    structure: structure,
    swingHigh: s.swingHigh[i] || null,
    swingLow: s.swingLow[i] || null,
    pdh: s.pdh[i] || null,
    pdl: s.pdl[i] || null,
    asianHigh: s.asianHigh[i] || null,
    asianLow: s.asianLow[i] || null
  };
}

function __kestrelFormat(value) {
  if (typeof value === 'string') return value;
  try {
    var text = JSON.stringify(value);
    return typeof text === 'string' ? text : String(value);
  } catch (err) {
    return String(value);
  }
}

function __kestrelNumber(value, label) {
  var n = Number(value);
  if (!isFinite(n)) throw new Error(label + ' must be a finite number');
  return n;
}

function __kestrelNormalize(sig, i) {
  if (sig === null || sig === undefined) return null;
  if (typeof sig !== 'object') {
    throw new Error('getSignal must return an object or null (bar ' + (i + 1) + ')');
  }
  var side = sig.side;
  if (side !== 'long' && side !== 'short') {
    throw new Error("signal.side must be 'long' or 'short' (bar " + (i + 1) + ')');
  }
  var stop = __kestrelNumber(sig.stop, 'signal.stop');
  if (stop <= 0) throw new Error('signal.stop must be > 0 (bar ' + (i + 1) + ')');

  var entry = 'market';
  if (sig.entry !== undefined && sig.entry !== null && sig.entry !== 'market') {
    entry = __kestrelNumber(sig.entry, 'signal.entry');
    if (entry <= 0) throw new Error('signal.entry must be > 0 (bar ' + (i + 1) + ')');
  }

  var out = {
    side: side,
    entry: entry,
    stop: stop,
    signalIndex: i,
    signalTime: __KP.bars.t[i]
  };

  if (sig.target !== undefined && sig.target !== null) {
    out.target = __kestrelNumber(sig.target, 'signal.target');
    if (out.target <= 0) throw new Error('signal.target must be > 0 (bar ' + (i + 1) + ')');
  }
  if (sig.riskPct !== undefined && sig.riskPct !== null) {
    out.riskPct = __kestrelNumber(sig.riskPct, 'signal.riskPct');
  }
  if (sig.maxBars !== undefined && sig.maxBars !== null) {
    out.maxBars = Math.floor(__kestrelNumber(sig.maxBars, 'signal.maxBars'));
    if (out.maxBars < 1) throw new Error('signal.maxBars must be >= 1');
  }
  if (sig.validBars !== undefined && sig.validBars !== null) {
    out.validBars = Math.floor(__kestrelNumber(sig.validBars, 'signal.validBars'));
    if (out.validBars < 1) throw new Error('signal.validBars must be >= 1');
  }
  if (sig.breakEvenAtR !== undefined && sig.breakEvenAtR !== null) {
    out.breakEvenAtR = __kestrelNumber(sig.breakEvenAtR, 'signal.breakEvenAtR');
  }
  if (sig.trailing !== undefined && sig.trailing !== null) {
    if (typeof sig.trailing !== 'object') throw new Error('signal.trailing must be an object');
    var type = sig.trailing.type;
    if (type !== 'atr' && type !== 'percent' && type !== 'fixed') {
      throw new Error("signal.trailing.type must be 'atr', 'percent' or 'fixed'");
    }
    out.trailing = {
      type: type,
      value: __kestrelNumber(sig.trailing.value, 'signal.trailing.value')
    };
  }
  if (sig.reason !== undefined && sig.reason !== null) {
    out.reason = String(sig.reason).slice(0, 200);
  }
  if (sig.tags !== undefined && sig.tags !== null) {
    if (!Array.isArray(sig.tags)) throw new Error('signal.tags must be an array of strings');
    out.tags = sig.tags.slice(0, 10).map(function (tag) { return String(tag).slice(0, 40); });
  }
  return out;
}

var __kestrelLogs = [];
function __kestrelLog(level, args) {
  if (__kestrelLogs.length >= __KP.limits.maxLogs) return;
  var parts = [];
  for (var k = 0; k < args.length; k += 1) parts.push(__kestrelFormat(args[k]).slice(0, 500));
  __kestrelLogs.push(level + ': ' + parts.join(' '));
}
globalThis.console = {
  log: function () { __kestrelLog('log', arguments); },
  info: function () { __kestrelLog('info', arguments); },
  warn: function () { __kestrelLog('warn', arguments); },
  error: function () { __kestrelLog('error', arguments); },
  debug: function () { __kestrelLog('debug', arguments); }
};

function __kestrelRun() {
  if (typeof getSignal !== 'function') {
    throw new Error('Your strategy must define a function named getSignal(ctx).');
  }
  var N = __KP.bars.t.length;
  var I = 0;
  function price(offset) {
    offset = offset === undefined ? 0 : Math.floor(offset);
    if (offset > 0) throw new Error('price() cannot read future bars (offset must be <= 0)');
    var j = I + offset;
    if (j < 0 || j >= N) return null;
    return { t: __KP.bars.t[j], open: __KP.bars.o[j], high: __KP.bars.h[j], low: __KP.bars.l[j], close: __KP.bars.c[j], volume: __KP.bars.v[j] };
  }
  function series(name, offset) {
    offset = offset === undefined ? 0 : Math.floor(offset);
    if (offset > 0) throw new Error('series() cannot read future bars (offset must be <= 0)');
    if (!Object.prototype.hasOwnProperty.call(__KP.series, name)) {
      throw new Error('Unknown series "' + name + '". Available: ' + __KP.seriesNames.join(', '));
    }
    var arr = __KP.series[name];
    var j = I + offset;
    if (j < 0 || j >= N) return null;
    var value = arr[j];
    return typeof value === 'number' && isFinite(value) ? value : null;
  }

  var signals = [];
  for (I = 0; I < N; I += 1) {
    var ctx = {
      i: I,
      bars: I + 1,
      t: __KP.bars.t[I],
      symbol: __KP.symbol,
      timeframe: __KP.timeframe,
      params: __KP.params,
      open: __KP.bars.o[I],
      high: __KP.bars.h[I],
      low: __KP.bars.l[I],
      close: __KP.bars.c[I],
      volume: __KP.bars.v[I],
      price: price,
      bar: price,
      series: series,
      session: __kestrelSession(__KP.bars.t[I]),
      smc: __kestrelSmc(I),
      atr: function (offset) { return series('atr14', offset); }
    };

    var sig;
    try {
      sig = getSignal(ctx);
    } catch (err) {
      throw new Error('getSignal threw on bar ' + (I + 1) + ': ' + (err && err.message ? err.message : String(err)));
    }
    var normalized = __kestrelNormalize(sig, I);
    if (normalized) {
      signals.push(normalized);
      if (signals.length > __KP.limits.maxSignals) {
        throw new Error('Strategy produced more than ' + __KP.limits.maxSignals + ' signals.');
      }
    }
  }

  return JSON.stringify({ signals: signals, logs: __kestrelLogs, bars: N });
}
`;

interface SandboxPayload {
  symbol: string;
  timeframe: string;
  bars: FeatureMatrix['bars'];
  series: FeatureMatrix['series'];
  seriesNames: readonly SeriesName[];
  smc: FeatureMatrix['smc'];
  params: Record<string, unknown>;
  limits: Pick<SandboxLimits, 'maxLogs' | 'maxSignals'>;
}

interface RawSandboxOutput {
  signals: unknown;
  logs: unknown;
  bars: unknown;
}

function describeDump(dump: unknown): string {
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

function toSignal(value: unknown): GeneratedSignal | null {
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

type QuickJSModule = QuickJSWASMModule;

let quickJSLoader: Promise<QuickJSModule> | null = null;

async function loadQuickJS(): Promise<QuickJSModule> {
  quickJSLoader ??= import('quickjs-emscripten').then((mod) => mod.getQuickJS());
  return quickJSLoader;
}

/**
 * Execute `getSignal(ctx)` over the full feature matrix.
 *
 * Throws `StrategySandboxError` for user-code errors, timeouts, or an
 * unavailable sandbox. The error message is safe to show to the user/agent.
 */
export async function runStrategySandbox(args: {
  source: string;
  matrix: FeatureMatrix;
  symbol: string;
  timeframe: string;
  params?: Record<string, unknown>;
  limits?: Partial<SandboxLimits>;
  signal?: AbortSignal;
}): Promise<StrategySandboxResult> {
  const source = args.source.trim();
  if (source.length === 0) throw new StrategySandboxError('Strategy source is empty.');
  if (source.length > 100_000) {
    throw new StrategySandboxError('Strategy source is larger than 100,000 characters.');
  }
  const limits: SandboxLimits = { ...DEFAULT_SANDBOX_LIMITS, ...args.limits };
  const payload: SandboxPayload = {
    symbol: args.symbol,
    timeframe: args.timeframe,
    bars: args.matrix.bars,
    series: args.matrix.series,
    seriesNames: SERIES_NAMES,
    smc: args.matrix.smc,
    params: args.params ?? {},
    limits: { maxLogs: limits.maxLogs, maxSignals: limits.maxSignals },
  };

  if (args.signal?.aborted) {
    throw new StrategySandboxError('Backtest cancelled before the sandbox started.');
  }

  let quickJS: QuickJSModule;
  try {
    quickJS = await loadQuickJS();
  } catch (err) {
    throw new StrategySandboxError(
      `The strategy sandbox is unavailable in this deployment (${
        err instanceof Error ? err.message : String(err)
      }).`,
    );
  }

  const deadline = Date.now() + limits.timeoutMs;
  const runtime = quickJS.newRuntime();
  runtime.setMemoryLimit(limits.memoryBytes);
  runtime.setMaxStackSize(limits.stackBytes);
  runtime.setInterruptHandler(() => {
    if (args.signal?.aborted) return true;
    return Date.now() > deadline;
  });

  const context = runtime.newContext();
  const script = `const __KP = JSON.parse(__KP_JSON);\n${source}\n;\n${DRIVER}\n__kestrelRun();`;

  try {
    const payloadHandle = context.newString(JSON.stringify(payload));
    context.setProp(context.global, '__KP_JSON', payloadHandle);
    payloadHandle.dispose();

    const evaluation = context.evalCode(script);
    if (evaluation.error) {
      const dumped = context.dump(evaluation.error);
      evaluation.error.dispose();
      const message = describeDump(dumped);
      if (/interrupted|out of memory/i.test(message)) {
        throw new StrategySandboxError(
          `Strategy exceeded the sandbox limits (${limits.timeoutMs}ms / ${Math.round(
            limits.memoryBytes / (1024 * 1024),
          )}MB). Simplify the loop or reduce the candle count.`,
        );
      }
      throw new StrategySandboxError(message);
    }

    const json = context.getString(evaluation.value);
    evaluation.value.dispose();

    let parsed: RawSandboxOutput;
    try {
      parsed = JSON.parse(json) as RawSandboxOutput;
    } catch {
      throw new StrategySandboxError('The strategy sandbox returned an invalid result.');
    }
    if (!Array.isArray(parsed.signals)) {
      throw new StrategySandboxError('The strategy sandbox returned no signal array.');
    }
    const signals: GeneratedSignal[] = [];
    for (let index = 0; index < parsed.signals.length; index += 1) {
      const signal = toSignal(parsed.signals[index]);
      if (signal) signals.push(signal);
    }
    const logs = Array.isArray(parsed.logs)
      ? parsed.logs
          .filter((line): line is string => typeof line === 'string')
          .slice(0, limits.maxLogs)
      : [];

    return {
      signals,
      logs,
      bars: typeof parsed.bars === 'number' ? parsed.bars : args.matrix.bars.t.length,
    };
  } catch (err) {
    if (err instanceof StrategySandboxError) throw err;
    throw new StrategySandboxError(err instanceof Error ? err.message : String(err));
  } finally {
    context.dispose();
    runtime.dispose();
  }
}

/** Exposed for tests: the exact contract a strategy can rely on. */
export const STRATEGY_CONTRACT = {
  signalFields: [
    'side',
    'entry',
    'stop',
    'target',
    'riskPct',
    'maxBars',
    'validBars',
    'trailing',
    'breakEvenAtR',
    'reason',
    'tags',
  ] as const satisfies readonly (keyof StrategySignal)[],
  series: SERIES_NAMES,
} as const;
