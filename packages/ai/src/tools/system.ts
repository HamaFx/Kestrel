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

// PF-13 — System tool category.
// Imported by tools/index.ts for self-registration and also exposed
// as a sub-path export: @kestrel/ai/tools/system

import { conveneCommitteeTool } from './convene-committee';
import { getSocialSentimentTool } from './get-social-sentiment';
import { getSystemDiagnosticsTool } from './get-system-diagnostics';
import { toolRegistry } from './registry';
import { replaySetupTool } from './replay-setup';
import { verifyCallTool } from './verify-call';

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
export function registerSystemTools(registry: typeof toolRegistry = toolRegistry): void {
  const systemTools = [
    ['get_system_diagnostics', getSystemDiagnosticsTool],
    ['get_social_sentiment', getSocialSentimentTool],
    ['verify_call', verifyCallTool],
    ['replay_setup', replaySetupTool],
    ['convene_committee', conveneCommitteeTool],
  ] as const;
  for (const [name, tool] of systemTools) {
    registry.register(name, tool);
  }
}

export { toolRegistry };
export type { ToolRegistry } from './registry';
