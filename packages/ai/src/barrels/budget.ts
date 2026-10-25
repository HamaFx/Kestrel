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

// Budget sub-barrel: budget facade, cost ledger, usage reporting, and
// rate-limit throttling. Re-exported by `src/index.ts`.

export {
  acquireBudget,
  effectiveDailyCap,
  isBudgetEnforced,
  reserveTurnBudget,
  resumeTurnBudget,
  UNCAPPED_DAILY_USD,
  type AcquireBudgetArgs,
  type AcquireBudgetResult,
  type BudgetHandle,
} from '../budget';
export {
  estimateCostUsd,
  estimateKnownCostUsd,
  resolveModelRate,
  UnknownModelPricingError,
  dailySpendUsd,
  reservedSpendUsd,
  enforceDailyBudget,
  tryReserveBudget,
  applyBudgetDelta,
  reconcileBudgetReservation,
  releaseBudgetReservation,
  recoverStaleBudgetReservations,
  getMonthlySpend,
  getProviderMonthlySpend,
  checkBudgetAlertsAndThresholds,
  DEFAULT_TURN_ESTIMATE_USD,
  DEFAULT_MAX_DAILY_USD,
  BudgetExceededError,
} from '../budget/cost';

// Usage
export {
  listTelemetry,
  computeUsage,
  providerIdFromModel,
  type TelemetryRow,
  type UsageStats,
  type ModelBreakdown,
  type ProviderBreakdown,
  type DayBucket,
} from '../budget/usage';

export { extractRateLimits, type RateLimitData } from '../budget/rate-limits';
export { noteLlmRateLimit, awaitLlmHeadroom } from '../budget/llm-throttle';
