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

import { TimeframeSchema } from '@kestrel/shared';
import { z } from 'zod';

import {
  EvidenceQualitySchema,
  XAUUSD,
  XauusdCandlesEvidenceSchema,
  XauusdIndicatorsEvidenceSchema,
  XauusdMacroEvidenceSchema,
  XauusdPriceEvidenceSchema,
} from './types';

export const XauusdResearchPacketSchema = z.object({
  packetId: z.string().min(1),
  kind: z.literal('research_packet'),
  symbol: z.literal(XAUUSD),
  generatedAt: z.string().datetime(),
  status: z.enum(['ready', 'blocked']),
  dataQuality: EvidenceQualitySchema,
  timeframes: z.array(TimeframeSchema),
  price: XauusdPriceEvidenceSchema.nullable(),
  candles: z.array(XauusdCandlesEvidenceSchema),
  indicators: z.array(XauusdIndicatorsEvidenceSchema),
  macro: XauusdMacroEvidenceSchema.nullable(),
  missingData: z.array(z.string()),
  warnings: z.array(z.string()),
});

export type XauusdResearchPacket = z.infer<typeof XauusdResearchPacketSchema>;
