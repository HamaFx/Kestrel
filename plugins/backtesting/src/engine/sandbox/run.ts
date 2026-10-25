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

// Sandbox entry point: execute `getSignal(ctx)` over the full feature matrix.

import { SERIES_NAMES, type FeatureMatrix } from '../features';
import type { GeneratedSignal, SandboxLimits, StrategySandboxResult } from '../types';
import { DRIVER } from './driver';
import { DEFAULT_SANDBOX_LIMITS, StrategySandboxError } from './limits';
import { describeDump, toSignal, type RawSandboxOutput, type SandboxPayload } from './output';
import { loadQuickJS, type QuickJSModule } from './quickjs';

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
