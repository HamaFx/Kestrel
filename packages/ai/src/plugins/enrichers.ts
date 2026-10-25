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

// Per-user packet enrichment.
//
// Plugins can contribute user-scoped context to a research packet (for
// example, open paper positions for the symbol). Enrichment is deliberately
// applied AFTER the 30-second base-packet cache read: the base market packet
// stays shareable across users, while plugin data never leaks between users
// and is never cached.

import { pluginHost } from '@kestrel/plugin-sdk';
import { createCategorizedLogger } from '@kestrel/shared/logger';

import {
  createPluginExecutionContext,
  getInstalledPluginRuntime,
  pluginSettingsFor,
} from './runtime';

const elog = createCategorizedLogger('ai', { component: 'plugin-packet-enrichers' });

export interface EnrichablePacket {
  symbol: string;
  status: string;
  pluginEnrichment?: Record<string, unknown> | undefined;
}

export type EnrichedPacket<T> = T & {
  pluginEnrichment?: Record<string, unknown> | undefined;
};

/**
 * Apply installed plugins' packet enrichers for one user.
 *
 * Fail-open: an enricher error (or a plugin-table outage) leaves the base
 * packet untouched. The returned packet is a new object; the cached base is
 * never mutated.
 */
export async function enrichPacketForUser<T extends { symbol: string; status: string }>(
  packet: T,
  userId: string,
  signal?: AbortSignal,
): Promise<EnrichedPacket<T>> {
  if (!userId || packet.status === 'blocked') return packet;

  const runtime = await getInstalledPluginRuntime(userId);
  if (!runtime.tenantId || runtime.installedPluginIds.length === 0) return packet;

  const enrichers = pluginHost
    .getPacketEnrichers()
    .filter((enricher) => runtime.installedPluginIds.includes(enricher.pluginId));
  if (enrichers.length === 0) return packet;

  const enrichment: Record<string, unknown> = {};
  for (const enricher of enrichers) {
    if (enricher.supportsSymbol && !enricher.supportsSymbol(packet.symbol)) continue;
    const ctx = createPluginExecutionContext({
      userId: runtime.userId,
      tenantId: runtime.tenantId,
      pluginId: enricher.pluginId,
      settings: pluginSettingsFor(runtime, enricher.pluginId),
      ...(signal ? { signal } : {}),
    });
    try {
      const value = await enricher.enrich({
        userId: runtime.userId,
        tenantId: runtime.tenantId,
        symbol: packet.symbol,
        settings: ctx.settings,
        log: ctx.log,
        ...(signal ? { signal } : {}),
      });
      if (value !== null && value !== undefined) {
        enrichment[`${enricher.pluginId}:${enricher.id}`] = value;
      }
    } catch (err) {
      elog.warn('packet enricher failed; continuing with the base packet', {
        pluginId: enricher.pluginId,
        enricher: enricher.id,
        userId,
        symbol: packet.symbol,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (Object.keys(enrichment).length === 0) return packet;
  return { ...packet, pluginEnrichment: enrichment };
}
