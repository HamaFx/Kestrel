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

// Deterministic command dispatch: maps a parsed command name to its handler.
// Each group keeps its handlers in a sibling module.

import { helpReply, type BotReply, type TelegramBotContext } from '../types';
import { meReply, positionsReply, settingsReply, statusReply, unlinkReply } from './account';
import { alertReply } from './alerts';
import { briefingReply } from './briefings';
import { calendarReply, newsReply, priceReply } from './market-data';

export async function dispatchDataCommand(
  command: string,
  args: string[],
  ctx: TelegramBotContext,
): Promise<BotReply | null> {
  switch (command) {
    case 'start':
    case 'help':
      return helpReply();
    case 'link':
      return {
        text: [
          '🔗 Link this chat to Kestrel',
          '',
          'Open Settings → Plugins → Telegram Copilot in the web app,',
          'click “Generate my link”, then tap the link it creates.',
          '',
          'The link expires after 15 minutes.',
        ].join('\n'),
      };
    case 'price':
      return priceReply(args[0]);
    case 'news':
      return newsReply(args[0]);
    case 'calendar':
      return calendarReply(args[0]);
    case 'status':
      return statusReply(ctx);
    case 'positions':
      return positionsReply(ctx);
    case 'me':
      return meReply(ctx);
    case 'settings':
      return settingsReply(ctx);
    case 'alert':
      return alertReply(args, ctx);
    case 'briefing':
      return briefingReply(ctx);
    case 'mute':
      await ctx.saveSettings({ alertsEnabled: false });
      return { text: '🔇 Alert notifications muted.' };
    case 'unmute':
      await ctx.saveSettings({ alertsEnabled: true });
      return { text: '🔔 Alert notifications resumed.' };
    case 'unlink':
      return unlinkReply(ctx);
    default:
      return null;
  }
}
