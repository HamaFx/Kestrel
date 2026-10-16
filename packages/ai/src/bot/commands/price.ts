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

// F7 — /price command: get current price for a symbol on-demand via @kestrel/data.
// /price XAUUSD → current gold price

import { getPriceWithMeta } from '@kestrel/data';
import { isKnownSymbol } from '@kestrel/shared';

import type { BotCommand, BotResponse } from '../types';

export const priceCommand: BotCommand = {
  name: 'price',
  aliases: ['p'],
  description: 'Get current price: /price <symbol>',
  handler: async (args: string[]): Promise<BotResponse> => {
    const symbolStr = args[0]?.trim().toUpperCase();
    if (!symbolStr) {
      return {
        text: 'Usage: /price <symbol>\nExample: /price XAUUSD',
      };
    }

    if (!isKnownSymbol(symbolStr)) {
      return {
        text: `Unknown symbol: ${symbolStr}. Example: /price XAUUSD`,
      };
    }

    try {
      const { tick } = await getPriceWithMeta(symbolStr);
      const time = new Date(tick.ts).toISOString();
      const statusLine =
        tick.marketState === 'closed' ? 'Status: Market Closed (Last Price)' : 'Status: Live';

      return {
        text: [
          `📊 ${tick.symbol}`,
          statusLine,
          `Bid: ${tick.bid}`,
          `Ask: ${tick.ask}`,
          `Mid: ${tick.mid}`,
          `Source: ${tick.source}`,
          `Updated: ${time}`,
        ].join('\n'),
      };
    } catch (err) {
      return {
        text: `Failed to fetch price for ${symbolStr}: ${err instanceof Error ? err.message : 'unknown error'}`,
      };
    }
  },
};
