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

// Research-packet enrichment: open paper exposure for the requested symbol.
//
// The base packet is cached and shared; this runs per user after the cache
// read, so it can never leak one user's positions to another.

import type { PluginPacketEnricher } from '@kestrel/plugin-sdk';

import { listPositionViews } from './services/trading';

export const paperPositionEnricher: PluginPacketEnricher = {
  id: 'open-paper-positions',

  supportsSymbol: (symbol) => typeof symbol === 'string' && symbol.length > 0,

  enrich: async ({ userId, symbol }) => {
    const positions = await listPositionViews(userId, {
      symbol,
      status: 'open',
      limit: 20,
    });
    if (positions.length === 0) return null;

    const unrealizedPnl =
      Math.round(positions.reduce((sum, position) => sum + position.unrealizedPnl, 0) * 100) / 100;
    const exposure = positions.map((position) => ({
      id: position.id,
      accountMode: position.accountMode,
      accountName: position.accountName,
      side: position.side,
      quantity: position.quantity,
      entryPrice: position.entryPrice,
      stopLoss: position.stopLoss,
      takeProfit: position.takeProfit,
      unrealizedPnl: position.unrealizedPnl,
      rMultiple: position.rMultiple,
    }));

    return {
      count: positions.length,
      unrealizedPnl,
      positions: exposure,
      note: 'Virtual paper exposure only. Use paper_list_positions for the full account view.',
    };
  },
};
