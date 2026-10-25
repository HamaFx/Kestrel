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

// Budget/cost facade. The implementation lives in focused modules:
//   pricing-catalog.ts    — static + catalog rates, token-cost estimation
//   budget-spend.ts       — daily/monthly counters and cap enforcement
//   budget-reservations.ts— durable per-turn reservation lifecycle
//   budget-alerts.ts      — monthly/provider threshold notifications
//
// Public exports are unchanged so `@kestrel/ai/cost`, the budget facade, and
// worker jobs keep one stable import path.

export * from './pricing-catalog';
export * from './budget-spend';
export * from './budget-reservations';
export * from './budget-alerts';
