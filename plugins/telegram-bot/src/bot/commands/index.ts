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

// Telegram command handlers.
//
// Data commands are deliberately deterministic (no LLM): they are cheap,
// fast, and safe to run from a scheduled briefing. AI commands live in
// `ai-commands/` and are dynamically imported so merely registering the
// plugin does not initialise the Mastra runtime.
//
// This barrel keeps the previous `bot/commands` import path working.

export { meReply, positionsReply, settingsReply, statusReply, unlinkReply } from './account';
export { alertReply } from './alerts';
export { briefingReply, buildBriefing, toggleReply } from './briefings';
export { dispatchDataCommand } from './dispatch';
export { calendarReply, newsReply, priceReply } from './market-data';
