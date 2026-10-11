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

// PF-13 — Journal / management tool category.
// Imported by tools/index.ts for self-registration and also exposed
// as a sub-path export: @kestrel/ai/tools/journal

import { getCalendarTool } from './get-calendar';
import { getJournalStatsTool } from './get-journal-stats';
import { getNewsTool } from './get-news';
import { logJournalTool } from './log-journal';
import { toolRegistry } from './registry';
import { searchKnowledgeTool } from './search-knowledge';
import { setAlertTool } from './set-alert';
import { shareSnapshotTool } from './share-snapshot';

const journalTools = [
  ['log_journal', logJournalTool],
  ['get_journal_stats', getJournalStatsTool],
  ['get_news', getNewsTool],
  ['get_calendar', getCalendarTool],
  ['set_alert', setAlertTool],
  ['search_knowledge', searchKnowledgeTool],
  ['share_snapshot', shareSnapshotTool],
] as const;

/**
 * Audit plan §4.3 — explicit registration instead of import side effects.
 * `registerAllTools` calls this exactly once at boot; importing the module
 * no longer mutates the singleton registry.
 */
export function registerJournalTools(registry: typeof toolRegistry = toolRegistry): void {
  for (const [name, tool] of journalTools) {
    registry.register(name, tool);
  }
}

export { toolRegistry };
export type { ToolRegistry } from './registry';
