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

import { createTool } from '@mastra/core/tools';

import { collectXauusdResearchPacket } from './research-packet';
import { XauusdResearchPacketSchema } from './research-types';
import { executeMastraTool } from './telemetry';
import { XauusdResearchPacketInputSchema } from './tool-schemas';

export const xauusdResearchPacketTool = createTool({
  id: 'get-xauusd-research-packet',
  description:
    'Collect the bounded deep-research evidence packet for XAUUSD: current price, daily/4h/1h/15m candles, and deterministic indicators. Use this first for broad gold analysis.',
  inputSchema: XauusdResearchPacketInputSchema,
  outputSchema: XauusdResearchPacketSchema,
  execute: async (_input, context) =>
    executeMastraTool('get-xauusd-research-packet', context, () =>
      collectXauusdResearchPacket(context.abortSignal),
    ),
});
