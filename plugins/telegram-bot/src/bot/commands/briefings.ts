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

// Briefing commands: /briefing, the scheduled briefing body and the menu
// toggle setters.

import { queries } from '@kestrel/db';

import type { BotReply, TelegramBotContext } from '../types';
import { DEFAULT_WEB_URL, formatDayTime, formatMoney, listOpenPaperPositions } from './shared';

export async function buildBriefing(ctx: TelegramBotContext): Promise<string> {
  const sections: string[] = [`☀️ Kestrel morning briefing — ${formatDayTime(Date.now())} UTC`, ''];
  const settings = ctx.settings;

  try {
    const { getPriceWithMeta } = await import('@kestrel/data');
    const { tick } = await getPriceWithMeta('XAUUSD');
    sections.push(
      `📊 Gold (XAUUSD): ${tick.bid} / ${tick.ask} · ${tick.marketState === 'closed' ? 'market closed' : 'live'}`,
    );
  } catch {
    sections.push('📊 Gold: price unavailable');
  }

  try {
    const articles = await queries.news.listRecentArticles(3, 0, {});
    if (articles.length > 0) {
      sections.push('', '📰 Headlines');
      for (const article of articles) sections.push(`• ${article.title} (${article.source})`);
    }
  } catch {
    // A briefing must still send if news is down.
  }

  try {
    const now = Date.now();
    const events = await queries.news.listUpcomingEvents(now, now + 2 * 86_400_000, 3);
    if (events.length > 0) {
      sections.push('', '📅 Next 48h');
      for (const event of events) {
        const impact =
          event.importance === 'high' ? '🔴' : event.importance === 'medium' ? '🟡' : '🟢';
        sections.push(`${impact} ${event.title} · ${formatDayTime(event.date)} UTC`);
      }
    }
  } catch {
    // ignore
  }

  if (settings.briefingIncludePositions) {
    try {
      const positions = await listOpenPaperPositions(ctx);
      sections.push('', `💼 Open paper positions: ${positions.length}`);
      for (const position of positions.slice(0, 6)) {
        const pnl = `${position.unrealizedPnl >= 0 ? '+' : ''}${formatMoney(
          position.unrealizedPnl,
        )}`;
        sections.push(`• ${position.symbol} ${position.side} ${position.quantity} units · ${pnl}`);
      }
    } catch {
      // ignore
    }
  }

  sections.push('', `Open: ${DEFAULT_WEB_URL}`);
  return sections.join('\n');
}

export async function briefingReply(ctx: TelegramBotContext): Promise<BotReply> {
  return { text: await buildBriefing(ctx) };
}

/** Toggle setters used by menu buttons (callback data `cmd:toggle-*`). */
export async function toggleReply(
  which: 'briefing' | 'alerts',
  ctx: TelegramBotContext,
): Promise<BotReply> {
  if (which === 'briefing') {
    const next = !ctx.settings.briefingEnabled;
    await ctx.saveSettings({ briefingEnabled: next });
    return {
      text: next
        ? `▶️ Daily briefing enabled for ${ctx.settings.briefingTime} ${ctx.settings.timezone}.`
        : '⏸ Daily briefing paused.',
    };
  }
  const next = !ctx.settings.alertsEnabled;
  await ctx.saveSettings({ alertsEnabled: next });
  return { text: next ? '🔔 Alert notifications resumed.' : '🔇 Alert notifications muted.' };
}
