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

// Briefings persistence barrel (DEC-05 split of persistence.ts) — locate or
// create the dedicated `Briefings_Thread` plus the idempotency helpers for
// `briefings_emitted`.
//
//   - thread.ts   — the singleton Briefings_Thread lookup/create
//   - emitted.ts  — emission dedupe (`briefings_emitted`)
//   - events.ts   — cron window query over `economic_events`
//   - latest.ts   — dashboard surface (latest briefing for the widget)

export { getOrCreateBriefingsThread } from './thread';
export { listEmittedEventIds, recordEmitted, wasEmitted } from './emitted';
export { findHighImpactEventsInWindow } from './events';
export { getLatestBriefing, type LatestBriefing } from './latest';
