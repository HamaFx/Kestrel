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

import { getCandlesWithMeta } from '@kestrel/data';
import { createTool } from '@mastra/core/tools';

import { buildCandlesEvidence } from './evidence-builders';
import { executeMastraTool } from './telemetry';
import { XauusdCandlesInputSchema } from './tool-schemas';
import { XauusdCandlesEvidenceSchema } from './types';

export const xauusdCandlesTool = createTool({
  id: 'get-xauusd-candles',
  description: 'Fetch XAUUSD OHLC candles for one timeframe with source and freshness metadata.',
  inputSchema: XauusdCandlesInputSchema,
  outputSchema: XauusdCandlesEvidenceSchema,
  execute: async ({ symbol, timeframe, count }, context) =>
    executeMastraTool('get-xauusd-candles', context, async () => {
      const result = await getCandlesWithMeta(symbol, timeframe, {
        count,
        ...(context.abortSignal ? { signal: context.abortSignal } : {}),
      });
      return buildCandlesEvidence(timeframe, count, result);
    }),
});
