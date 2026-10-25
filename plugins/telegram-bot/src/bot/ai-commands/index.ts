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

// AI-backed Telegram commands.
//
// Everything Mastra-related is dynamically imported so plugin registration
// stays cheap. The handlers reuse Kestrel's canonical mode runner and
// background-text path rather than duplicating agent logic.
//
// This barrel keeps the previous `bot/ai-commands` import path working.

export { agentsReply } from './agents';
export { analyzeReply, committeeReply } from './analyze';
export { askReply } from './ask';
