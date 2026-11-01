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

// R16 (audit 2026-10-31) — the QuickJS evaluation is synchronous, so the
// engine has to hand the event loop back explicitly. These tests pin the
// cooperative yield: the host process must get a macrotask turn before and
// after a sandbox evaluation, not only when the whole run finishes.

import type { Candle } from '@kestrel/shared';
import { describe, expect, it } from 'vitest';

import { buildFeatureMatrix } from '../src/engine/features';
import { runStrategySandbox } from '../src/engine/sandbox';
import type { SandboxLimits } from '../src/engine/types';
import { yieldToEventLoop } from '../src/engine/yield';

const BASE_TIME = Date.UTC(2026, 0, 5, 0, 0, 0);

function waveCandles(count: number): Candle[] {
  return Array.from({ length: count }, (_, index) => {
    const mid = 2000 + Math.sin(index / 9) * 30 + index * 0.15;
    const t = BASE_TIME + index * 3_600_000;
    return {
      symbol: 'XAUUSD',
      tf: '1h',
      t,
      o: mid - 2,
      h: mid + 8,
      l: mid - 9,
      c: mid + Math.sin(index / 3) * 2,
      v: 1000 + index,
      source: 'test',
      fetchedAt: t,
    };
  });
}

const NOOP_SOURCE = `
function getSignal(ctx) {
  return null;
}`;

function matrix() {
  return buildFeatureMatrix({ symbol: 'XAUUSD', timeframe: '1h', candles: waveCandles(120) });
}

describe('yieldToEventLoop', () => {
  it('runs a previously queued macrotask before it resolves', async () => {
    let ran = false;
    setImmediate(() => {
      ran = true;
    });
    await yieldToEventLoop();
    expect(ran).toBe(true);
  });
});

describe('sandbox event-loop fairness', () => {
  it('gives the host a turn before evaluating user code', async () => {
    const order: string[] = [];
    setImmediate(() => order.push('host'));

    const result = await runStrategySandbox({
      source: NOOP_SOURCE,
      matrix: matrix(),
      symbol: 'XAUUSD',
      timeframe: '1h',
      limits: { timeoutMs: 1_000 } as Partial<SandboxLimits>,
    });
    order.push('sandbox');

    // The immediate queued before the call must run first: the sandbox yields
    // a macrotask turn before it takes the loop for the synchronous eval.
    expect(order).toEqual(['host', 'sandbox']);
    expect(result.signals).toEqual([]);
  });

  it('keeps the event loop usable while an evaluation is in flight', async () => {
    let turnDuringRun = false;
    const running = runStrategySandbox({
      source: NOOP_SOURCE,
      matrix: matrix(),
      symbol: 'XAUUSD',
      timeframe: '1h',
      limits: { timeoutMs: 1_000 } as Partial<SandboxLimits>,
    });
    // The pre-eval yield lets this immediate run while the sandbox promise is
    // still pending, proving the loop is usable during a run, not only after.
    setImmediate(() => {
      turnDuringRun = true;
    });
    await running;
    expect(turnDuringRun).toBe(true);
  });
});
