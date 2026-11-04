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

// Declarative chat-intent hints for the AI planner (P0-3). The router matches
// these patterns only when the user has this plugin installed.

import type { PluginChatIntent } from '@kestrel/plugin-sdk';

const TELEGRAM_INTENT_RE =
  /\b(telegram(?:\s+bot|\s+briefing|\s+recap|\s+alert|\s+digest|\s+notification)?)\b|^\/telegram\b/i;

export const telegramBotChatIntent: readonly PluginChatIntent[] = [
  {
    reason: 'telegram-keyword',
    priority: 10,
    patterns: [TELEGRAM_INTENT_RE],
  },
];
