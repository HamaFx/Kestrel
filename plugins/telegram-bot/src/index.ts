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

// @kestrel/plugin-telegram-bot — Phase 3.
//
// Owns the interactive Telegram bot (grammY), the one-tap account linking
// flow, per-user daily briefings, and four agent tools. Core alert delivery
// remains in `@kestrel/ai` for web-created alerts; alerts created from this
// bot use the plugin's `telegram-bot` channel.

import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { definePlugin } from '@kestrel/plugin-sdk';

import { telegramAlertChannel } from './alerts';
import { dailyBriefingJob } from './jobs/daily-briefing';
import { onTelegramInstall, onTelegramUninstall } from './lifecycle';
import {
  configureWebhookRoute,
  createLinkRoute,
  statusRoute,
  testMessageRoute,
  unlinkRoute,
  validateTokenRoute,
} from './server/setup';
import { handleTelegramWebhookRoute } from './server/webhook';
import { PLUGIN_ID, settingsSchema } from './settings';
import { telegramTools } from './tools';

/**
 * Resolve the skill directory across source, Next standalone, and pnpm-deploy
 * layouts. Bundlers inline `import.meta.url` in some server chunks, so the
 * source-relative candidate is only one of several valid locations.
 */
function resolveSkillPath(): string {
  const candidates = [
    join(dirname(fileURLToPath(import.meta.url)), '..', 'skills', 'telegram-copilot'),
    join(process.cwd(), 'plugins', 'telegram-bot', 'skills', 'telegram-copilot'),
    join(
      process.cwd(),
      'node_modules',
      '@kestrel',
      'plugin-telegram-bot',
      'skills',
      'telegram-copilot',
    ),
    join(process.cwd(), '..', '..', 'plugins', 'telegram-bot', 'skills', 'telegram-copilot'),
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0]!;
}

const skillPath = resolveSkillPath();

const plugin = definePlugin({
  manifest: {
    id: PLUGIN_ID,
    name: 'Telegram Copilot',
    version: '0.1.0',
    tagline: 'Your Kestrel account, alerts, and briefings in Telegram.',
    description:
      'Connect your own Telegram bot with a guided BotFather wizard. Chat with Kestrel, run the 4-desk committee, create alerts, and receive a per-user daily market briefing in your timezone.',
    category: 'channels-automation',
    iconName: 'IconBrandTelegram',
    installMode: 'wizard',
    settingsSchema,
    defaultSettings: {
      alertsEnabled: true,
      briefingEnabled: false,
      briefingTime: '07:30',
      timezone: 'UTC',
      briefingIncludePositions: true,
    },
    badges: [
      'Per-user bot',
      'One-tap linking',
      'Daily briefings',
      'Adds 4 AI tools',
      'Adds sidebar tab',
    ],
    setupSteps: [
      {
        id: 'create-bot',
        title: 'Create your bot with BotFather',
        description:
          'In Telegram, open @BotFather, send /newbot, choose a name and username, then copy the HTTP API token it returns. Your bot stays yours — Kestrel never shares it with other users.',
        kind: 'instructions',
        link: {
          label: 'Open @BotFather',
          urlTemplate: 'https://t.me/BotFather',
        },
      },
      {
        id: 'credentials',
        title: 'Paste your bot token',
        description:
          'Paste the token from BotFather. Kestrel validates it live with Telegram and stores it encrypted at rest.',
        kind: 'credentials',
        fields: ['botToken'],
        action: {
          id: 'validate-token',
          label: 'Validate bot token',
        },
      },
      {
        id: 'webhook',
        title: 'Configure the webhook automatically',
        description:
          'Kestrel registers a secret webhook URL with Telegram and installs the command menu. No CLI or manual setWebhook call is required.',
        kind: 'action',
        action: {
          id: 'configure-webhook',
          label: 'Configure webhook',
        },
      },
      {
        id: 'generate-link',
        title: 'Generate your one-tap link',
        description:
          'Create a single-use link that connects your Telegram chat to this Kestrel account. It expires in 15 minutes.',
        kind: 'action',
        action: {
          id: 'create-link',
          label: 'Generate my link',
        },
      },
      {
        id: 'link-account',
        title: 'Link your chat',
        description:
          'Open the link on your phone and tap Start. Kestrel links the chat automatically — there is no 6-digit code to type.',
        kind: 'link',
        link: {
          label: 'Open Telegram & link my account',
          urlTemplate: '{linkUrl}',
        },
      },
    ],
  },
  skills: [skillPath],
  tools: telegramTools,
  jobs: [dailyBriefingJob],
  alertChannels: [telegramAlertChannel],
  apiRoutes: {
    '/setup/validate-token': validateTokenRoute,
    '/setup/configure-webhook': configureWebhookRoute,
    '/setup/create-link': createLinkRoute,
    '/status': statusRoute,
    '/unlink': unlinkRoute,
    '/test-message': testMessageRoute,
  },
  publicApiRoutes: {
    '/webhook/:token': handleTelegramWebhookRoute,
  },
  onUserInstall: onTelegramInstall,
  onUserUninstall: onTelegramUninstall,
});

export default plugin;
