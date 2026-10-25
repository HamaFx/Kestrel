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

// Paper Trading persistence helpers — barrel for the split query groups.
//
// Callers are always inside a tenant transaction (chat tool, plugin API,
// worker TickBus/job) and every query additionally filters by user_id.

export {
  findAccountByMode,
  getAccount,
  listAccounts,
  setAccountBalance,
  updateAccountSettings,
  type AccountSettingsPatch,
} from './accounts';
export { deleteAllPaperData, resetAccount, seedAccount, type SeedAccountInput } from './seed';
export {
  deleteStrategyRun,
  getStrategyRun,
  insertStrategyRun,
  listStrategyRuns,
  updateStrategyRun,
  type StrategyRunPatch,
} from './strategy-runs';
export {
  countOpenPositions,
  getPosition,
  insertPosition,
  listOpenPositions,
  listOpenPositionsForSymbol,
  listPositions,
  updatePosition,
  type InsertPositionInput,
  type PositionPatch,
} from './positions';
export {
  getOrder,
  insertOrder,
  listOrders,
  listPendingOrdersForSymbol,
  updateOrder,
  type InsertOrderInput,
  type OrderPatch,
} from './orders';
export { insertFill, listFills, type InsertFillInput } from './fills';
export { listWatchedSymbols } from './symbols';
