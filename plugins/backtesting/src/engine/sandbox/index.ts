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

// QuickJS strategy sandbox.
//
// Agent-authored `getSignal(ctx)` code runs in a WebAssembly QuickJS runtime
// with:
//   * no host globals (no require, process, fetch, fs, or module loader)
//   * a hard memory limit and stack limit
//   * a wall-clock interrupt handler (runaway loops are interrupted)
//   * a point-in-time feature view; `series(name, offset)` rejects offset > 0
//
// The strategy loops over bars *inside* the sandbox, so a 5,000-bar backtest
// crosses the WASM boundary once, not 5,000 times. The engine owns execution:
// a strategy can only describe intent, never fill prices or timestamps.
//
// This barrel keeps the previous `./sandbox` import path working.

export { DEFAULT_SANDBOX_LIMITS, StrategySandboxError } from './limits';
export { runStrategySandbox } from './run';
export { STRATEGY_CONTRACT } from './contract';
