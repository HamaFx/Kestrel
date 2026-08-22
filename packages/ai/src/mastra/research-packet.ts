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

import { randomUUID } from 'node:crypto';

import { metrics } from '@kestrel/shared';
import { createCategorizedLogger } from '@kestrel/shared/logger';

import { assembleXauusdResearchPacket } from './research-packet-assemble';
import { fetchXauusdResearchData } from './research-packet-fetch';
import { startResearchStage } from './research-packet-stages';
import type { XauusdResearchPacket } from './research-types';
import { XAUUSD } from './types';

const rlog = createCategorizedLogger('ai', {
  component: 'mastra-xauusd-research-packet',
});

/**
 * Fetches the fixed technical scope used by the first deep-research milestone.
 * The model receives this packet before explaining the market; it does not
 * decide which required timeframes to omit.
 */
export async function collectXauusdResearchPacket(
  signal?: AbortSignal,
): Promise<XauusdResearchPacket> {
  const packetId = `kestrel-research-${randomUUID()}`;
  const generatedAt = new Date().toISOString();
  startResearchStage('packet', { packetId, symbol: XAUUSD });
  const fetched = await fetchXauusdResearchData(signal);
  const packet = assembleXauusdResearchPacket(packetId, generatedAt, fetched);

  metrics.increment('mastra_research_packet_total', {
    tags: { status: packet.status, symbol: XAUUSD },
  });
  if (packet.status === 'blocked') {
    metrics.increment('mastra_research_packet_blocked_total', {
      tags: { symbol: XAUUSD },
    });
  }

  rlog.info('Mastra XAUUSD research packet collected', {
    packetId,
    status: packet.status,
    dataQuality: packet.dataQuality,
    candleTimeframes: packet.candles.map((evidence) => evidence.timeframe),
    indicatorTimeframes: packet.indicators.map((evidence) => evidence.timeframe),
    missingDataCount: packet.missingData.length,
  });
  return packet;
}
