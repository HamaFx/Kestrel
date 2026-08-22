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

import { GetIntermarketInputSchema, GetIntermarketOutputSchema } from '@kestrel/shared';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

import { getIntermarketTool } from '../tools/get-intermarket';
import { createEvidenceId } from './evidence';
import { executeLegacyReadOnlyTool } from './legacy-tool-adapter';
import { executeMastraTool } from './telemetry';
import { XAUUSD } from './types';

const InputSchema = GetIntermarketInputSchema;
const OutputSchema = z.object({
  evidenceId: z.string().min(1),
  symbol: z.literal(XAUUSD),
  source: z.literal('kestrel-deterministic-intermarket'),
  fetchedAt: z.string().datetime(),
  dataAsOf: z.string().datetime(),
  freshness: z.literal('unknown'),
  quality: z.literal('degraded'),
  warnings: z.array(z.string()),
  data: GetIntermarketOutputSchema,
});

export const xauusdIntermarketTool = createTool({
  id: 'get-xauusd-intermarket',
  description:
    'Read the deterministic XAUUSD intermarket pulse: two-leg DXY proxy, gold 24-hour change, XAU/DXY correlation, regime, and regime-break warning. Use for a narrow dollar or risk-tone follow-up.',
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  execute: async ({ tf, windowBars }, context) =>
    executeMastraTool('get-xauusd-intermarket', context, async () => {
      const data = await executeLegacyReadOnlyTool<z.infer<typeof GetIntermarketOutputSchema>>(
        getIntermarketTool,
        { tf, windowBars },
        context.abortSignal,
      );
      const warnings = [
        ...(data.partial ? ['One or more intermarket series were unavailable'] : []),
        'The composite legacy tool does not expose per-symbol provider freshness metadata',
        'The DXY value is a two-leg proxy, not the full DXY index',
      ];

      return OutputSchema.parse({
        evidenceId: createEvidenceId('intermarket', XAUUSD, tf),
        symbol: XAUUSD,
        source: 'kestrel-deterministic-intermarket',
        fetchedAt: new Date(data.asOf).toISOString(),
        dataAsOf: new Date(data.asOf).toISOString(),
        freshness: 'unknown',
        quality: 'degraded',
        warnings,
        data,
      });
    }),
});

export {
  InputSchema as XauusdIntermarketInputSchema,
  OutputSchema as XauusdIntermarketOutputSchema,
};
