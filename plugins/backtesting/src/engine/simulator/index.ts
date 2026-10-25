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

// Deterministic bar-by-bar execution simulator.
//
// This barrel keeps the previous `./simulator` import path working; the bar
// loop lives in `loop.ts`, trade/equity accounting in `accounting.ts`, entry
// and exit handling in `entries.ts`, and pure arithmetic in `math.ts`.

export { simulateBacktest } from './loop';
export { round } from './math';
