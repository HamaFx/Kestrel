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

// Public engine surface.
//
// Exported through `@kestrel/plugin-backtesting/engine` so tests, the plugin
// API, and future integrations (paper-trading strategy previews) can reuse the
// exact same simulation without importing plugin internals.

export { buildFeatureMatrix, SERIES_NAMES, type FeatureMatrix } from './features';
export { computeMetrics } from './metrics';
export { downsample, defaultBacktestOptions, runBacktest, type RunBacktestOutput } from './run';
export {
  DEFAULT_SANDBOX_LIMITS,
  runStrategySandbox,
  STRATEGY_CONTRACT,
  StrategySandboxError,
} from './sandbox';
export { simulateBacktest } from './simulator';
export type {
  BacktestMetrics,
  BacktestOptions,
  BacktestResult,
  BacktestTrade,
  EntryType,
  EquityPoint,
  GeneratedSignal,
  RejectedSignal,
  SandboxLimits,
  StrategySignal,
  StrategyTrailing,
  TradeExitReason,
  TradeSide,
  TrailingMode,
} from './types';
