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
//
// P2-01 removal: the natively-migrated tools (`get_news`, `search_knowledge`)
// are no longer registered here. Their canonical Mastra registrations in
// `mastra-v2/tools/canonical/` are the only implementations; consumers
// resolve them natively (`resolveNativeCanonicalTool`) instead of through
// this legacy registry.

import { getCalendarTool } from './get-calendar';
import { getJournalStatsTool } from './get-journal-stats';
import { logJournalTool } from './log-journal';
import { toolRegistry } from './registry';
import { setAlertTool } from './set-alert';
import { shareSnapshotTool } from './share-snapshot';

/**
 * Audit plan §4.3 — explicit registration instead of import side effects.
 * `registerAllTools` calls this exactly once at boot; importing the module
 * no longer mutates the singleton registry.
 *
 * The list is built inside the function: the native Mastra registrations
 * import these tool modules eagerly, so a module-scope list can be evaluated
 * while a sibling tool module is still initialising inside the
 * `instance ↔ tools` import cycle (Phase 4 Task 2).
 */
export function registerJournalTools(registry: typeof toolRegistry = toolRegistry): void {
  const journalTools = [
    ['log_journal', logJournalTool],
    ['get_journal_stats', getJournalStatsTool],
    ['get_calendar', getCalendarTool],
    ['set_alert', setAlertTool],
    ['share_snapshot', shareSnapshotTool],
  ] as const;
  for (const [name, tool] of journalTools) {
    registry.register(name, tool);
  }
}

export { toolRegistry };
export type { ToolRegistry } from './registry';
