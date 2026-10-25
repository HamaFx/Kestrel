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

// Worker TickBus subscriber.
//
// A tick can arrive thousands of times per minute. The subscriber therefore
// keeps a short-lived per-user "watched symbols" cache (open positions +
// pending orders) so only traders with exposure to that symbol open a tenant
// transaction. Each user is throttled and single-flight; a slow DB write can
// never queue up behind the feed.

import { withTenantDb } from '@kestrel/db';
import type { PluginTick, PluginTickContext, PluginTickSubscriber } from '@kestrel/plugin-sdk';

import { listWatchedSymbols } from './db/queries';
import { quotesFromTick, type MarketTick } from './domain';
import { spreadFor } from './services/pricing';
import { processQuotesForUser } from './services/trading';
import { normaliseSettings } from './settings';

const INTEREST_TTL_MS = 10_000;
const MIN_INTERVAL_MS = 250;
const MAX_USERS_PER_TICK = 250;

interface InterestEntry {
  expiresAt: number;
  symbols: ReadonlySet<string>;
}

const interest = new Map<string, InterestEntry>();
const loadInFlight = new Map<string, Promise<ReadonlySet<string>>>();
const processing = new Set<string>();
const lastProcessedAt = new Map<string, number>();
let warnedAboutCap = false;

function toMarketTick(tick: PluginTick): MarketTick {
  return {
    symbol: tick.symbol,
    bid: tick.bid,
    ask: tick.ask,
    mid: tick.mid,
    ts: tick.ts,
    source: tick.source,
  };
}

async function loadInterest(userId: string, tenantId: string): Promise<ReadonlySet<string>> {
  const existing = loadInFlight.get(userId);
  if (existing) return existing;

  const promise = withTenantDb(tenantId, () => listWatchedSymbols(userId), { userId })
    .then((symbols) => new Set(symbols))
    .finally(() => {
      loadInFlight.delete(userId);
    });
  loadInFlight.set(userId, promise);
  return promise;
}

async function isWatched(userId: string, tenantId: string, symbol: string): Promise<boolean> {
  const now = Date.now();
  const cached = interest.get(userId);
  if (cached && cached.expiresAt > now) return cached.symbols.has(symbol);

  const symbols = await loadInterest(userId, tenantId);
  interest.set(userId, { expiresAt: now + INTEREST_TTL_MS, symbols });
  return symbols.has(symbol);
}

export const paperTickSubscriber: PluginTickSubscriber = {
  id: 'paper-fills',
  handler: async (tick: PluginTick, ctx: PluginTickContext) => {
    const users = await ctx.getInstalledUsers();
    if (users.length === 0) return;
    if (users.length > MAX_USERS_PER_TICK && !warnedAboutCap) {
      warnedAboutCap = true;
      ctx.log.warn('paper-trading tick fan-out capped', {
        installedUsers: users.length,
        cap: MAX_USERS_PER_TICK,
      });
    }

    const now = Date.now();
    for (const user of users.slice(0, MAX_USERS_PER_TICK)) {
      if (ctx.signal.aborted) return;
      try {
        if (!(await isWatched(user.userId, user.tenantId, tick.symbol))) continue;

        const last = lastProcessedAt.get(user.userId) ?? 0;
        if (now - last < MIN_INTERVAL_MS) continue;
        if (processing.has(user.userId)) continue;

        processing.add(user.userId);
        lastProcessedAt.set(user.userId, now);
        try {
          const settings = normaliseSettings(user.settings);
          const quotes = quotesFromTick(toMarketTick(tick), spreadFor(tick.symbol, settings));
          const result = await withTenantDb(
            user.tenantId,
            () =>
              processQuotesForUser({
                userId: user.userId,
                quotesBySymbol: new Map([[tick.symbol, quotes]]),
                settings,
                now: new Date(now),
                source: 'tick',
                onJournalError: (err) =>
                  ctx.log.warn('paper trade journal sync failed', {
                    userId: user.userId,
                    err: err instanceof Error ? err.message : String(err),
                  }),
              }),
            { userId: user.userId },
          );
          // A fill/close changes the watched-symbol set; a mark-to-market
          // update does not. Re-resolve only when exposure changed, otherwise
          // keep the cache and avoid a query on every tick.
          if (result.filled > 0 || result.closed > 0) {
            interest.delete(user.userId);
          }
        } finally {
          processing.delete(user.userId);
        }
      } catch (err) {
        interest.delete(user.userId);
        ctx.log.error('paper-trading tick processing failed', {
          userId: user.userId,
          symbol: tick.symbol,
          err: err instanceof Error ? err.message : String(err),
        });
      }
    }
  },
};

/** Test helper. */
export function resetPaperTickCacheForTests(): void {
  interest.clear();
  loadInFlight.clear();
  processing.clear();
  lastProcessedAt.clear();
  warnedAboutCap = false;
}
