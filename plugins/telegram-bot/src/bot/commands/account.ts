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

// Account + settings commands: /status, /positions, /me, /settings, /unlink.

import { countActiveAlerts, getUserWithSettings } from '@kestrel/db';
import { getMarketPhase, isForexWeekend } from '@kestrel/shared';
import { InlineKeyboard } from 'grammy';

import { getLinkedChat, unlinkChat } from '../link';
import type { BotReply, TelegramBotContext } from '../types';
import {
  bullet,
  DEFAULT_WEB_URL,
  formatDayTime,
  formatMoney,
  listOpenPaperPositions,
} from './shared';

export async function statusReply(ctx: TelegramBotContext): Promise<BotReply> {
  try {
    const [positions, alerts] = await Promise.all([
      listOpenPaperPositions(ctx),
      countActiveAlerts(ctx.userId),
    ]);
    const phase = getMarketPhase();
    const weekend = isForexWeekend();

    return {
      text: [
        '🟢 Kestrel status',
        '',
        bullet('Session', phase.session),
        bullet('Liquidity', phase.liquidity),
        weekend ? '⚠️ Weekend — FX markets closed' : '✅ FX markets open',
        '',
        '📊 Your account',
        bullet('Open positions', String(positions.length)),
        bullet('Active alerts', String(alerts)),
        bullet('Telegram', ctx.settings.linkedChatId ? 'Linked' : 'Not linked'),
        bullet('Bot alerts', ctx.settings.alertsEnabled ? 'On' : 'Muted'),
        bullet('Daily briefing', ctx.settings.briefingEnabled ? ctx.settings.briefingTime : 'Off'),
      ].join('\n'),
    };
  } catch (err) {
    return {
      text: `Status check failed: ${err instanceof Error ? err.message : 'unknown error'}`,
    };
  }
}

export async function positionsReply(ctx: TelegramBotContext): Promise<BotReply> {
  try {
    const positions = await listOpenPaperPositions(ctx);
    if (positions.length === 0) return { text: '📭 No open paper positions.' };

    const lines = [`📊 Open paper positions (${positions.length})`, ''];
    for (const position of positions) {
      const direction = position.side === 'long' ? '🟢 Long' : '🔴 Short';
      const pnl = `${position.unrealizedPnl >= 0 ? '🟢' : '🔴'} ${formatMoney(
        position.unrealizedPnl,
      )}`;
      lines.push(`${direction} ${position.symbol} · ${position.quantity} units`);
      lines.push(`   Entry ${position.entryPrice} · ${pnl}`);
    }
    return { text: lines.join('\n') };
  } catch (err) {
    return {
      text: `Could not load paper positions: ${err instanceof Error ? err.message : 'unknown error'}`,
    };
  }
}

export async function meReply(ctx: TelegramBotContext): Promise<BotReply> {
  try {
    const [{ user }, { dailySpendUsd }] = await Promise.all([
      getUserWithSettings(ctx.userId),
      import('@kestrel/ai'),
    ]);
    const [alerts, spend, link] = await Promise.all([
      countActiveAlerts(ctx.userId),
      dailySpendUsd(ctx.userId),
      getLinkedChat(ctx.userId, ctx.tenantId),
    ]);

    return {
      text: [
        '👤 Your Kestrel account',
        '',
        bullet('Name', user?.name ?? 'Not set'),
        bullet('Email', user?.email ?? 'Not set'),
        bullet('Telegram', link ? `Linked since ${formatDayTime(link.linkedAt)}` : 'Not linked'),
        '',
        '📊 Today',
        bullet('AI spend', formatMoney(spend)),
        bullet('Active alerts', String(alerts)),
        '',
        DEFAULT_WEB_URL,
      ].join('\n'),
    };
  } catch (err) {
    return {
      text: `Could not load your account: ${err instanceof Error ? err.message : 'unknown error'}`,
    };
  }
}

export async function settingsReply(ctx: TelegramBotContext): Promise<BotReply> {
  return {
    text: [
      '⚙️ Telegram Copilot settings',
      '',
      bullet('Bot', ctx.settings.botUsername ? `@${ctx.settings.botUsername}` : 'Not configured'),
      bullet('Chat', ctx.settings.linkedChatId ? 'Linked' : 'Not linked'),
      bullet('Alert notifications', ctx.settings.alertsEnabled ? 'On' : 'Muted'),
      bullet(
        'Daily briefing',
        ctx.settings.briefingEnabled
          ? `${ctx.settings.briefingTime} ${ctx.settings.timezone}`
          : 'Off',
      ),
      bullet('Include positions', ctx.settings.briefingIncludePositions ? 'Yes' : 'No'),
      '',
      'Change these from the web app:',
      `${DEFAULT_WEB_URL}/settings/plugins`,
    ].join('\n'),
    keyboard: new InlineKeyboard()
      .text(
        ctx.settings.briefingEnabled ? '⏸ Pause briefing' : '▶️ Enable briefing',
        'cmd:toggle-briefing',
      )
      .row()
      .text(
        ctx.settings.alertsEnabled ? '🔇 Mute alerts' : '🔔 Unmute alerts',
        'cmd:toggle-alerts',
      ),
  };
}

export async function unlinkReply(ctx: TelegramBotContext): Promise<BotReply> {
  await unlinkChat(ctx.userId, ctx.tenantId);
  await ctx.saveSettings({ linkedChatId: undefined, linkedAt: undefined });
  return {
    text: '🔓 This chat is no longer linked to Kestrel. Generate a new link from the web app to reconnect.',
  };
}
