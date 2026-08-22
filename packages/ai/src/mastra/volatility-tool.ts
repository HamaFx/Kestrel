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

import { ForecastVolatilityInputSchema, ForecastVolatilityOutputSchema } from '@kestrel/shared';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

import { forecastVolatilityTool } from '../tools/forecast-volatility';
import { createEvidenceId } from './evidence';
import { executeLegacyReadOnlyTool } from './legacy-tool-adapter';
import { executeMastraTool } from './telemetry';
import { XauusdSymbolSchema } from './tool-schemas';
import { XAUUSD } from './types';

const InputSchema = ForecastVolatilityInputSchema.extend({
  symbol: XauusdSymbolSchema,
});
const OutputSchema = z.object({
  evidenceId: z.string().min(1),
  symbol: z.literal(XAUUSD),
  source: z.literal('kestrel-deterministic-volatility'),
  fetchedAt: z.string().datetime(),
  dataAsOf: z.string().datetime(),
  freshness: z.literal('unknown'),
  quality: z.literal('degraded'),
  warnings: z.array(z.string()),
  data: ForecastVolatilityOutputSchema,
});

export const xauusdVolatilityTool = createTool({
  id: 'forecast-xauusd-volatility',
  description:
    'Read the deterministic XAUUSD ATR-based forward-volatility forecast, expected move, projected range, event multiplier, and next high-impact event. Use for a narrow expected-range question; this is not a trade recommendation.',
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  execute: async ({ symbol, tf, horizonHours }, context) =>
    executeMastraTool('forecast-xauusd-volatility', context, async () => {
      const data = await executeLegacyReadOnlyTool<z.infer<typeof ForecastVolatilityOutputSchema>>(
        forecastVolatilityTool,
        { symbol, tf, horizonHours },
        context.abortSignal,
      );
      const warnings = [
        'The composite legacy tool does not expose provider freshness metadata for candles, price, or event data',
        ...(data.expectedRange === null
          ? ['Live price was unavailable; expected range is omitted']
          : []),
      ];

      return OutputSchema.parse({
        evidenceId: createEvidenceId('volatility', symbol, tf),
        symbol,
        source: 'kestrel-deterministic-volatility',
        fetchedAt: new Date(data.asOf).toISOString(),
        dataAsOf: new Date(data.asOf).toISOString(),
        freshness: 'unknown',
        quality: 'degraded',
        warnings,
        data,
      });
    }),
});

export { InputSchema as XauusdVolatilityInputSchema, OutputSchema as XauusdVolatilityOutputSchema };
