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

// Minute job: evaluate every active deployed strategy for installed users.

import type { PluginJobRegistration } from '@kestrel/plugin-sdk';

import { normaliseSettings } from '../settings';
import { runStrategyRunsForUser } from '../strategy-runner';

let inFlight = false;

export const paperStrategyRunnerJob: PluginJobRegistration = {
  id: 'strategy-runner',
  description: 'Evaluate deployed paper strategies on each new closed bar',
  schedule: '* * * * *',
  lock: 'none',
  run: async (ctx) => {
    if (inFlight) return { processed: 0, note: 'previous strategy-runner pass still running' };
    inFlight = true;
    let processed = 0;
    let entered = 0;
    let closed = 0;
    let errors = 0;
    try {
      const users = await ctx.getInstalledUsers();
      for (const user of users) {
        if (ctx.signal.aborted) break;
        try {
          const settings = normaliseSettings(user.settings);
          const result = await runStrategyRunsForUser(user.userId, settings, ctx.signal);
          processed += 1;
          entered += result.entered;
          closed += result.closed;
          errors += result.errors;
        } catch (err) {
          errors += 1;
          ctx.log.warn('paper strategy runner failed for user', {
            userId: user.userId,
            err: err instanceof Error ? err.message : String(err),
          });
        }
      }
    } finally {
      inFlight = false;
    }
    return {
      processed,
      note: `${entered} entr${entered === 1 ? 'y' : 'ies'}, ${closed} close${
        closed === 1 ? '' : 's'
      }, ${errors} error${errors === 1 ? '' : 's'}`,
    };
  },
};
