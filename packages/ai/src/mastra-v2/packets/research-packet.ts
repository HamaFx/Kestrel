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
import {
  XauusdResearchPacketSchema,
  type XauusdResearchPacket,
} from './research-types';
import { XAUUSD } from '../shared/types';
import { createPacketCache } from './packet-cache';

const rlog = createCategorizedLogger('ai', {
  component: 'mastra-xauusd-research-packet',
});

/**
 * Q5 (fresh-only) predicate for the XAUUSD verified packet — mirrors
 * `isFreshCacheablePacket`: only `ready`, warning-free, fully fresh packets
 * are cached, so packet quality can never regress through the cache.
 */
export function isFreshCacheableXauusdPacket(packet: XauusdResearchPacket): boolean {
  if (packet.status !== 'ready') return false;
  if (packet.missingData.length > 0 || packet.warnings.length > 0) return false;
  if (packet.dataQuality !== 'complete') return false;
  if (packet.price?.freshness !== 'fresh') return false;
  return (
    packet.candles.every((evidence) => evidence.freshness === 'fresh' && evidence.quality === 'complete') &&
    packet.indicators.every(
      (evidence) => evidence.freshness === 'fresh' && evidence.quality === 'complete',
    )
  );
}

/**
 * §2.1/P1-10 — the XAUUSD packet rides the SAME 30s fresh-only cache
 * machinery as the committee's `collectSymbolResearchPacketCached` (one
 * factory, one TTL, one LRU discipline, one Redis mirror, one
 * `PHASE2_PACKET_CACHE` rollback flag), namespaced apart because the
 * verified XAUUSD packet keeps its own schema (Q6: do not merge schemas —
 * only collection/caching is unified).
 */
const xauusdPacketCache = createPacketCache<XauusdResearchPacket>({
  namespace: 'xauusd-packet',
  isCacheable: isFreshCacheableXauusdPacket,
  revive: (raw) => {
    const parsed = XauusdResearchPacketSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  },
});

/**
 * Fetches the fixed technical scope used by the first deep-research milestone.
 * The model receives this packet before explaining the market; it does not
 * decide which required timeframes to omit.
 */
async function collectXauusdResearchPacketUncached(
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

/**
 * §2.1/P1-10 — cache-wrapped XAUUSD packet collection. The conversation path
 * (run.ts), the verified-report workflow, and the research-packet tool all
 * collect through here, so market-open bursts deduplicate onto one
 * collection and share the data-layer candle cache with the committee
 * pipeline (windows aligned in research-config.ts). Fresh-only per Q5:
 * blocked, degraded, or partial packets are never cached.
 * `PHASE2_PACKET_CACHE=0` rolls back to uncached collection with identical
 * packet contents. Q6: the richer VERIFIED packet schema and its evidence
 * assembly are deliberately kept — only collection/caching is unified.
 */
export async function collectXauusdResearchPacket(
  signal?: AbortSignal,
): Promise<XauusdResearchPacket> {
  return xauusdPacketCache.collect(XAUUSD, collectXauusdResearchPacketUncached, signal);
}
