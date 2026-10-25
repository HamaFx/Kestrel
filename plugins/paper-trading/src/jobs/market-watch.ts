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

// Minute safety net for the paper broker.
//
// The TickBus handles sub-second fills. This job covers deployments (or brief
// windows) without a live feed: it fetches one quote per watched symbol,
// evaluates stops/targets/trailing stops, fills resting orders, and refreshes
// unrealised P&L. It is intentionally bounded per run.

import { withTenantDb } from '@kestrel/db';
import type { PluginJobRegistration } from '@kestrel/plugin-sdk';

import { listWatchedSymbols } from '../db/queries';
import { quotesFromTick } from '../domain';
import { loadTicks, spreadFor } from '../services/pricing';
import { processQuotesForUser } from '../services/trading';
import { normaliseSettings } from '../settings';

const MAX_USERS_PER_RUN = 100;

export const paperMarketWatchJob: PluginJobRegistration = {
  id: 'paper-market-watch',
  description: 'Minute mark-to-market, stop/target evaluation and resting-order matching fallback.',
  schedule: '* * * * *',
  timezone: 'UTC',
  lock: 'none',
  run: async (ctx) => {
    const users = await ctx.getInstalledUsers();
    let processed = 0;
    let skipped = 0;

    for (const user of users.slice(0, MAX_USERS_PER_RUN)) {
      if (ctx.signal.aborted) break;
      try {
        const symbols = await withTenantDb(user.tenantId, () => listWatchedSymbols(user.userId), {
          userId: user.userId,
        });
        if (symbols.length === 0) continue;

        const settings = normaliseSettings(user.settings);
        const ticks = await loadTicks(symbols, ctx.signal);
        if (ticks.size === 0) {
          skipped += 1;
          continue;
        }

        const quotesBySymbol = new Map(
          [...ticks.entries()].map(([symbol, tick]) => [
            symbol,
            quotesFromTick(tick, spreadFor(symbol, settings)),
          ]),
        );

        await withTenantDb(
          user.tenantId,
          () =>
            processQuotesForUser({
              userId: user.userId,
              quotesBySymbol,
              settings,
              source: 'market-watch',
              onJournalError: (err) =>
                ctx.log.warn('paper trade journal sync failed', {
                  userId: user.userId,
                  err: err instanceof Error ? err.message : String(err),
                }),
            }),
          { userId: user.userId },
        );
        processed += 1;
      } catch (err) {
        ctx.log.warn('paper market-watch user failed', {
          userId: user.userId,
          err: err instanceof Error ? err.message : String(err),
        });
        skipped += 1;
      }
    }

    return {
      processed,
      note:
        users.length > MAX_USERS_PER_RUN
          ? `Processed ${processed}/${users.length} users (cap ${MAX_USERS_PER_RUN}); skipped ${skipped}.`
          : `Processed ${processed}; skipped ${skipped}.`,
    };
  },
};
