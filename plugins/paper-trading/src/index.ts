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

// @kestrel/plugin-paper-trading — Phase 5.
//
// Dual-mode virtual broker:
//   Personal Demo (confirm)       — every order needs an approval card
//   AI Agent Sandbox (autonomous) — agents trade 24/7 without approval
//
// Fills come from the worker TickBus in sub-second time; a minute job is the
// safety net for deployments without a live feed. Closed trades are copied to
// the Trade Journal.

import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { definePlugin } from '@kestrel/plugin-sdk';

import { paperTradingApiRoutes } from './api/routes';
import { deleteAllPaperData } from './db/queries';
import { paperMarketWatchJob } from './jobs/market-watch';
import { paperStrategyRunnerJob } from './jobs/strategy-runner';
import { paperPositionEnricher } from './packet-enricher';
import { ensurePaperAccounts } from './services/accounts';
import { DEFAULT_SETTINGS, normaliseSettings, PLUGIN_ID, settingsSchema } from './settings';
import { paperTickSubscriber } from './tick';
import { paperTradingTools } from './tools';

function resolveSkillDir(name: string): string {
  const candidates = [
    join(dirname(fileURLToPath(import.meta.url)), '..', 'skills', name),
    join(process.cwd(), 'plugins', 'paper-trading', 'skills', name),
    join(process.cwd(), 'node_modules', '@kestrel', 'plugin-paper-trading', 'skills', name),
    join(process.cwd(), '..', '..', 'plugins', 'paper-trading', 'skills', name),
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0]!;
}

const plugin = definePlugin({
  manifest: {
    id: PLUGIN_ID,
    name: 'Paper Trading',
    version: '0.1.0',
    tagline: 'A dual-mode virtual broker: approve every trade, or let an agent run.',
    description:
      'Trade gold, forex and crypto against a virtual account with realistic spread, slippage and commission. The Personal Demo requires an Approve/Deny card for every order; the AI Agent Sandbox lets agents and scheduled strategies open, trail and close positions autonomously. Live ticks fill resting orders in sub-second time, and every closed trade is copied to your Journal.',
    category: 'trading-execution',
    iconName: 'IconWallet',
    installMode: 'instant',
    settingsSchema,
    defaultSettings: { ...DEFAULT_SETTINGS },
    badges: [
      '2 virtual accounts',
      'Approve / deny orders',
      'Autonomous sandbox',
      'Live tick fills',
      'Adds 10 AI tools',
      'Adds sidebar tab',
    ],
    setupSteps: [],
  },
  skills: [resolveSkillDir('paper-trading-desk')],
  tools: paperTradingTools,
  jobs: [paperMarketWatchJob, paperStrategyRunnerJob],
  tickSubscribers: [paperTickSubscriber],
  packetEnrichers: [paperPositionEnricher],
  apiRoutes: paperTradingApiRoutes,
  onUserInstall: async (ctx) => {
    await ensurePaperAccounts(ctx.userId, normaliseSettings(ctx.settings));
  },
  onUserUninstall: async (ctx) => {
    if (!ctx.wipeData) return;
    await deleteAllPaperData(ctx.userId);
  },
});

export default plugin;
