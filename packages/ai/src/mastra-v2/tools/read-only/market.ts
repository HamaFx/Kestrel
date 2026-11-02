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

// SPDX-License-Identifier: Apache-2.0

// Phase 4 Task 2 — native Mastra registrations for the market and economic
// calendar read-only tools. Each registration wraps the existing deterministic
// execute core via `createReadOnlyToolExecute`; there is no runtime adaptation
// step.
//
// Built lazily (see `read-only/index.ts`): reading the legacy tool bindings at
// module scope would race the `instance ↔ tools` import cycle and surface a
// TDZ ReferenceError during cyclic evaluation.

import {
  GetCorrelationInputSchema,
  GetIntermarketInputSchema,
  GetIntermarketResonanceInputSchema,
  GetSeasonalityInputSchema,
  GetSessionLevelsInputSchema,
  type GetCalendarOutput,
  type GetCorrelationOutput,
  type GetIntermarketOutput,
  type GetIntermarketResonanceOutput,
  type GetSeasonalityOutput,
  type GetSessionLevelsOutput,
} from '@kestrel/shared';
import { createTool } from '@mastra/core/tools';
import type { z } from 'zod';

import { GetCalendarInputSchema, getCalendarTool } from '@ai/tools/get-calendar';
import { getCorrelationTool } from '@ai/tools/get-correlation';
import { getIntermarketResonanceTool } from '@ai/tools/get-intermarket-resonance';
import { getIntermarketTool } from '@ai/tools/get-intermarket';
import { getSeasonalityTool } from '@ai/tools/get-seasonality';
import { getSessionLevelsTool } from '@ai/tools/get-session-levels';
import {
  createReadOnlyToolExecute,
  executeLegacyReadOnlyTool,
  readOnlyToolDescription,
} from '@ai/mastra-v2/tools/tool-lifecycle';

/** Native market-domain read-only tools by registry name. */
export function buildMarketReadOnlyTools(): Readonly<Record<string, unknown>> {
  return {
    get_calendar: createTool({
      id: 'kestrel-get_calendar',
      description: readOnlyToolDescription(getCalendarTool, 'get_calendar'),
      inputSchema: GetCalendarInputSchema,
      execute: createReadOnlyToolExecute<
        z.infer<typeof GetCalendarInputSchema>,
        GetCalendarOutput
      >('kestrel-get_calendar', 'get_calendar', (input, context) =>
        executeLegacyReadOnlyTool(getCalendarTool, input, context),
      ),
    }),
    get_correlation: createTool({
      id: 'kestrel-get_correlation',
      description: readOnlyToolDescription(getCorrelationTool, 'get_correlation'),
      inputSchema: GetCorrelationInputSchema,
      execute: createReadOnlyToolExecute<
        z.infer<typeof GetCorrelationInputSchema>,
        GetCorrelationOutput
      >('kestrel-get_correlation', 'get_correlation', (input, context) =>
        executeLegacyReadOnlyTool(getCorrelationTool, input, context),
      ),
    }),
    get_intermarket: createTool({
      id: 'kestrel-get_intermarket',
      description: readOnlyToolDescription(getIntermarketTool, 'get_intermarket'),
      inputSchema: GetIntermarketInputSchema,
      execute: createReadOnlyToolExecute<
        z.infer<typeof GetIntermarketInputSchema>,
        GetIntermarketOutput
      >('kestrel-get_intermarket', 'get_intermarket', (input, context) =>
        executeLegacyReadOnlyTool(getIntermarketTool, input, context),
      ),
    }),
    get_intermarket_resonance: createTool({
      id: 'kestrel-get_intermarket_resonance',
      description: readOnlyToolDescription(
        getIntermarketResonanceTool,
        'get_intermarket_resonance',
      ),
      inputSchema: GetIntermarketResonanceInputSchema,
      execute: createReadOnlyToolExecute<
        z.infer<typeof GetIntermarketResonanceInputSchema>,
        GetIntermarketResonanceOutput
      >('kestrel-get_intermarket_resonance', 'get_intermarket_resonance', (input, context) =>
        executeLegacyReadOnlyTool(getIntermarketResonanceTool, input, context),
      ),
    }),
    get_seasonality: createTool({
      id: 'kestrel-get_seasonality',
      description: readOnlyToolDescription(getSeasonalityTool, 'get_seasonality'),
      inputSchema: GetSeasonalityInputSchema,
      execute: createReadOnlyToolExecute<
        z.infer<typeof GetSeasonalityInputSchema>,
        GetSeasonalityOutput
      >('kestrel-get_seasonality', 'get_seasonality', (input, context) =>
        executeLegacyReadOnlyTool(getSeasonalityTool, input, context),
      ),
    }),
    get_session_levels: createTool({
      id: 'kestrel-get_session_levels',
      description: readOnlyToolDescription(getSessionLevelsTool, 'get_session_levels'),
      inputSchema: GetSessionLevelsInputSchema,
      execute: createReadOnlyToolExecute<
        z.infer<typeof GetSessionLevelsInputSchema>,
        GetSessionLevelsOutput
      >('kestrel-get_session_levels', 'get_session_levels', (input, context) =>
        executeLegacyReadOnlyTool(getSessionLevelsTool, input, context),
      ),
    }),
  };
}
