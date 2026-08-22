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

import { getPortfolioSnapshotTool } from './get-portfolio-snapshot';
import { getSocialSentimentTool } from './get-social-sentiment';
import { getSystemDiagnosticsTool } from './get-system-diagnostics';
import { toolRegistry } from './registry';
import { replaySetupTool } from './replay-setup';
import { runSystemActionTool } from './run-system-action';
import { verifyCallTool } from './verify-call';

const systemTools = [
  ['get_system_diagnostics', getSystemDiagnosticsTool],
  ['run_system_action', runSystemActionTool],
  ['get_portfolio_snapshot', getPortfolioSnapshotTool],
  ['get_social_sentiment', getSocialSentimentTool],
  ['verify_call', verifyCallTool],
  ['replay_setup', replaySetupTool],
] as const;

for (const [name, tool] of systemTools) {
  toolRegistry.register(name, tool);
}

export { toolRegistry };
export type { ToolRegistry } from './registry';
