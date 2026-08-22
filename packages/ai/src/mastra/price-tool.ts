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

import { getPriceWithMeta } from '@kestrel/data';
import { createTool } from '@mastra/core/tools';

import { buildPriceEvidence } from './evidence-builders';
import { executeMastraTool } from './telemetry';
import { XauusdPriceInputSchema } from './tool-schemas';
import { XauusdPriceEvidenceSchema } from './types';

export const xauusdPriceTool = createTool({
  id: 'get-xauusd-price',
  description: 'Fetch the latest XAUUSD mid price with source and freshness metadata.',
  inputSchema: XauusdPriceInputSchema,
  outputSchema: XauusdPriceEvidenceSchema,
  execute: async ({ symbol }, context) =>
    executeMastraTool('get-xauusd-price', context, async () => {
      const result = await getPriceWithMeta(symbol, {
        ...(context.abortSignal ? { signal: context.abortSignal } : {}),
      });
      return buildPriceEvidence(result);
    }),
});
