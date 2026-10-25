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

// Authenticated Paper Trading HTTP routes.
//
// Mounted at /api/plugins/paper-trading/<path> by the core plugin dispatcher.
// This barrel keeps the previous `api/routes` import path working.

import type { PluginApiRouteHandler } from '@kestrel/plugin-sdk';

import { accounts, resetAccount, summary, updateAccount } from './accounts';
import { fills } from './fills';
import { cancelOrder, createOrder, orders } from './orders';
import { closePosition, getPosition, modifyPosition, positions } from './positions';
import { byMethod } from './shared';
import {
  deleteStrategyRun,
  deployStrategyRun,
  listStrategyRuns,
  updateStrategyRun,
} from './strategy-runs';

export const paperTradingApiRoutes: Readonly<Record<string, PluginApiRouteHandler>> = {
  '/summary': byMethod({ GET: summary }),
  '/accounts': byMethod({ GET: accounts }),
  '/accounts/:accountId': byMethod({ PATCH: updateAccount }),
  '/accounts/:accountId/reset': byMethod({ POST: resetAccount }),
  '/positions': byMethod({ GET: positions }),
  '/positions/:positionId': byMethod({ GET: getPosition, PATCH: modifyPosition }),
  '/positions/:positionId/close': byMethod({ POST: closePosition }),
  '/orders': byMethod({ GET: orders, POST: createOrder }),
  '/orders/:orderId': byMethod({ DELETE: cancelOrder }),
  '/fills': byMethod({ GET: fills }),
  '/strategy-runs': byMethod({ GET: listStrategyRuns, POST: deployStrategyRun }),
  '/strategy-runs/:strategyRunId': byMethod({
    PATCH: updateStrategyRun,
    DELETE: deleteStrategyRun,
  }),
};
