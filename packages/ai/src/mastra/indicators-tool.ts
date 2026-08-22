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

import { buildIndicatorsEvidence } from './evidence-builders';
import { executeMastraTool } from './telemetry';
import { XauusdIndicatorsInputSchema } from './tool-schemas';
import { XauusdIndicatorsEvidenceSchema } from './types';

export const xauusdIndicatorsTool = createTool({
  id: 'get-xauusd-indicators',
  description:
    'Compute XAUUSD indicators from one candle window and return recent values with evidence metadata.',
  inputSchema: XauusdIndicatorsInputSchema,
  outputSchema: XauusdIndicatorsEvidenceSchema,
  execute: async ({ symbol, timeframe, count, indicators }, context) =>
    executeMastraTool('get-xauusd-indicators', context, async () => {
      const result = await getCandlesWithMeta(symbol, timeframe, {
        count,
        ...(context.abortSignal ? { signal: context.abortSignal } : {}),
      });
      return buildIndicatorsEvidence(timeframe, count, result, indicators);
    }),
});
