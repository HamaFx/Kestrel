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

// SPDX-License-Identifier: Apache-2.0

// Briefings barrel (DEC-05 split of generate.ts). Re-exports the former
// module surface: the emit entrypoints, prompt/fallback builders, and the
// pure calendar/currency helpers used by tests.

export type { BriefingsEnv } from './env';
export { emitPreEvent, emitPostEvent, emitWeeklyReview } from './emit';
export {
  buildEventPrompt,
  deterministicEventSummary,
  deterministicWeeklyReview,
  surpriseLabel,
} from './prompts';
export { isoWeekKey, symbolFromCurrency } from './helpers';
