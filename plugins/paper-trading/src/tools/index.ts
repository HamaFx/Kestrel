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

// Paper Trading agent tools — barrel for the split tool groups.
//
// Confirmation policy (D-02):
//   * Personal Demo (mode 'confirm') — order placement and risk changes need
//     the Mastra approval card before execution.
//   * AI Agent Sandbox (mode 'autonomous_sandbox') — agents may place, trail
//     and close trades without approval.
// Closing a position and cancelling a pending order are always risk-reducing,
// so they never block on approval.

import type { PluginToolRegistration } from '@kestrel/plugin-sdk';

import { getAccountsTool, resetAccountTool, updateAccountTool } from './accounts';
import { cancelOrderTool, listOrdersTool, placeOrderTool } from './orders';
import {
  closePositionTool,
  getPositionTool,
  listPositionsTool,
  modifyPositionTool,
} from './positions';
import { deployStrategyTool, listStrategyRunsTool } from './strategy-runs';

export const paperTradingTools: readonly PluginToolRegistration[] = [
  getAccountsTool,
  placeOrderTool,
  listPositionsTool,
  listOrdersTool,
  getPositionTool,
  cancelOrderTool,
  closePositionTool,
  modifyPositionTool,
  updateAccountTool,
  resetAccountTool,
  listStrategyRunsTool,
  deployStrategyTool,
];
