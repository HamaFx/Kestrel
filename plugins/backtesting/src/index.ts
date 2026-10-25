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

// @kestrel/plugin-backtesting — Phase 4.
//
// Gives Kestrel's agents a knowledge-driven quant research loop:
//   SKILL.md playbooks -> sandboxed getSignal(ctx) authoring ->
//   deterministic bar-by-bar execution -> scorecard -> iterate.
//
// The plugin owns its runs/strategy library tables and knowledge documents.
// Nothing here mutates core chat, portfolio, or alert state.

import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { definePlugin } from '@kestrel/plugin-sdk';

import { backtestingApiRoutes } from './api/routes';
import { deleteAllBacktestData } from './db/queries';
import { DEFAULT_SETTINGS, PLUGIN_ID, settingsSchema } from './settings';
import { backtestingTools } from './tools';

/**
 * Resolve a skill directory across source, Next standalone, and pnpm-deploy
 * layouts. Bundlers inline `import.meta.url` in some server chunks, so the
 * source-relative candidate is only one of several valid locations.
 */
function resolveSkillDir(name: string): string {
  const candidates = [
    join(dirname(fileURLToPath(import.meta.url)), '..', 'skills', name),
    join(process.cwd(), 'plugins', 'backtesting', 'skills', name),
    join(process.cwd(), 'node_modules', '@kestrel', 'plugin-backtesting', 'skills', name),
    join(process.cwd(), '..', '..', 'plugins', 'backtesting', 'skills', name),
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0]!;
}

const plugin = definePlugin({
  manifest: {
    id: PLUGIN_ID,
    name: 'Backtesting Lab',
    version: '0.1.0',
    tagline: 'Agent-authored strategies, tested bar-by-bar without look-ahead.',
    description:
      'Turn trading playbooks into code. Kestrel agents read SMC/ICT and quant skills, write a getSignal(ctx) strategy, and run it through a deterministic sandboxed simulator with realistic spread, slippage, stops, trailing exits and a full scorecard. Every run is saved with its exact source so you can compare, iterate and audit.',
    category: 'quant-research',
    iconName: 'IconFlask',
    installMode: 'instant',
    settingsSchema,
    defaultSettings: { ...DEFAULT_SETTINGS },
    badges: [
      '3 strategy skills',
      'Sandboxed getSignal()',
      'SMC + 33 TA series',
      'Equity curves',
      'Adds sidebar tab',
    ],
    setupSteps: [],
  },
  skills: [
    resolveSkillDir('strategy-architect'),
    resolveSkillDir('smc-ict-playbooks'),
    resolveSkillDir('quant-playbooks'),
  ],
  tools: backtestingTools,
  apiRoutes: backtestingApiRoutes,
  onUserUninstall: async (ctx) => {
    if (!ctx.wipeData) return;
    await deleteAllBacktestData(ctx.userId);
  },
});

export default plugin;
