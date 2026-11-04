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

// Tool: get_session_levels.
//
// Slices today's (and optionally the prior day's) 1H candles by UTC
// session boundaries — Asia 00:00–07:00, London 07:00–12:00, NY 12:00–
// 21:00 — and returns each session's OHLC + a `forming` flag when the
// session window's right edge is in the future. Boundaries match the
// LIVE_SNAPSHOT classifier in `packages/ai/src/context.ts`.
//
// R8 (audit 2026-10-31): the candle read is freshness-aware (`getCandles`)
// and a stale window is disclosed via `stale` + `notes` rather than being
// presented as current.

import { getCandles } from '@kestrel/data';
import { computeSessionRanges } from '@kestrel/indicators';
import {
  GetSessionLevelsInputSchema,
  type Candle,
  type GetSessionLevelsOutput,
} from '@kestrel/shared';
import { tool, type Tool } from 'ai';
import type { z } from 'zod';

import { maybeGetToolContext } from '../runtime/tool-context';

const InputSchema = GetSessionLevelsInputSchema;

declare module '@kestrel/shared' {
  interface ToolIOMap {
    get_session_levels: { input: z.infer<typeof InputSchema> };
  }
}

interface SessionLevelsComputationArgs {
  symbol: GetSessionLevelsOutput['symbol'];
  includePrior: boolean;
  candles: Candle[];
  nowMs?: number;
  /**
   * R8 (audit 2026-10-31): true when the candle window was served from the
   * stale-while-revalidate cache. Disclosed in the output instead of being
   * dropped, so a stale level is never presented as current.
   */
  stale?: boolean;
}

/** Pure session projection shared by the legacy AI SDK tool and Mastra adapter. */
function computeSessionLevels({
  symbol,
  includePrior,
  candles,
  nowMs = Date.now(),
  stale = false,
}: SessionLevelsComputationArgs): GetSessionLevelsOutput {
  if (candles.length === 0) {
    return {
      symbol,
      asOf: nowMs,
      today: [],
      prior: includePrior ? [] : null,
      pipelinePending: true,
      stale,
      notes: 'Session levels unavailable: no candles were returned for the lookback window.',
    };
  }

  // Session boundaries live in @kestrel/indicators so the Asian-range helper,
  // the backtester, and this tool cannot disagree about them.
  const { today, prior } = computeSessionRanges(candles, nowMs, { includePrior });

  return {
    symbol,
    asOf: nowMs,
    today,
    prior,
    pipelinePending: false,
    stale,
    ...(stale
      ? {
          notes:
            'At least one candle window was served from a stale cache; treat these session levels as provisional.',
        }
      : {}),
  };
}

export const getSessionLevelsTool: Tool<z.infer<typeof InputSchema>, GetSessionLevelsOutput> = tool(
  {
    description:
      "Compute today's (and optionally yesterday's) Asia / London / NY session OHLC levels for one symbol. Use when the user asks 'where did Asia top out', 'show the London open', 'NY range', or wants intraday session context. Returns per-session open / high / low / close + a `forming` flag when the session is still in progress.",
    inputSchema: InputSchema,
    execute: async (
      { symbol, includePrior },
      options?: { abortSignal?: AbortSignal },
    ): Promise<GetSessionLevelsOutput> => {
      const signal = options?.abortSignal ?? maybeGetToolContext()?.signal ?? undefined;
      // 48h of 1H bars covers today + yesterday including the final NY close.
      const result = await getCandles(symbol, '1h', {
        count: 60,
        ...(signal ? { signal } : {}),
      });
      return computeSessionLevels({
        symbol,
        includePrior,
        candles: result.candles,
        stale: result.stale,
      });
    },
  },
);
