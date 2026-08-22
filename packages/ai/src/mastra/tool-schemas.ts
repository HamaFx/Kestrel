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

import {
  IndicatorKindSchema,
  IndicatorParamsSchema,
  SymbolSchema,
  TimeframeSchema,
} from '@kestrel/shared';
import { z } from 'zod';

import { XAUUSD } from './types';

export const PRICE_MAX_AGE_MS = 10_000;
export const MAX_CANDLE_OUTPUT = 200;
export const MAX_INDICATOR_OUTPUT = 30;

export const XauusdSymbolSchema = SymbolSchema.refine((symbol) => symbol === XAUUSD, {
  message: 'The Mastra proof of concept currently supports XAUUSD only',
});

export const XauusdPriceInputSchema = z.object({
  symbol: XauusdSymbolSchema.default(XAUUSD),
});

export const XauusdResearchPacketInputSchema = z.object({
  symbol: XauusdSymbolSchema.default(XAUUSD),
});

export const XauusdCandlesInputSchema = z.object({
  symbol: XauusdSymbolSchema.default(XAUUSD),
  timeframe: TimeframeSchema,
  count: z.number().int().min(10).max(MAX_CANDLE_OUTPUT).default(120),
});

export const XauusdIndicatorsInputSchema = z.object({
  symbol: XauusdSymbolSchema.default(XAUUSD),
  timeframe: TimeframeSchema,
  count: z.number().int().min(20).max(MAX_CANDLE_OUTPUT).default(200),
  indicators: z
    .array(
      z.object({
        kind: IndicatorKindSchema,
        params: IndicatorParamsSchema.default({}),
      }),
    )
    .min(1)
    .max(6),
});
