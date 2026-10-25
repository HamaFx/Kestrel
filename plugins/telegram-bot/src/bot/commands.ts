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

// Telegram command handlers.
//
// Data commands are deliberately deterministic (no LLM): they are cheap,
// fast, and safe to run from a scheduled briefing. AI commands live in
// `ai-commands.ts` and are dynamically imported so merely registering the
// plugin does not initialise the Mastra runtime.

import {
  countActiveAlerts,
  createAlert,
  getUserWithSettings,
  queries,
  withTenantDb,
} from '@kestrel/db';
import { paperPositions } from '@kestrel/plugin-paper-trading/db/tables';
import { getMarketPhase, isForexWeekend, isKnownSymbol } from '@kestrel/shared';
import { and, desc, eq } from 'drizzle-orm';
import { InlineKeyboard } from 'grammy';

import { getLinkedChat, unlinkChat } from './link';
import { helpReply, type BotReply, type TelegramBotContext } from './types';

const DEFAULT_WEB_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://kestrel.ai';

function bullet(label: string, value: string): string {
  return `${label}: ${value}`;
}

function formatMoney(value: number): string {
  return `$${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function formatDayTime(value: Date | number | string): string {
  return new Date(value).toLocaleString('en-GB', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  });
}

interface TelegramPaperPosition {
  symbol: string;
  side: string;
  quantity: number;
  entryPrice: number;
  unrealizedPnl: number;
}

/**
 * DEC-03 — the Telegram plugin reads open positions from the canonical
 * Paper Trading plugin tables inside a tenant-scoped transaction. Kestrel's
 * legacy core portfolio no longer exists.
 */
async function listOpenPaperPositions(ctx: TelegramBotContext): Promise<TelegramPaperPosition[]> {
  return withTenantDb(
    ctx.tenantId,
    async (db) =>
      db
        .select({
          symbol: paperPositions.symbol,
          side: paperPositions.side,
          quantity: paperPositions.quantity,
          entryPrice: paperPositions.entryPrice,
          unrealizedPnl: paperPositions.unrealizedPnl,
        })
        .from(paperPositions)
        .where(and(eq(paperPositions.userId, ctx.userId), eq(paperPositions.status, 'open')))
        .orderBy(desc(paperPositions.entryTime))
        .limit(20),
    { userId: ctx.userId },
  );
}

export async function priceReply(symbolRaw: string | undefined): Promise<BotReply> {
  const symbol = symbolRaw?.trim().toUpperCase();
  if (!symbol) {
    return { text: 'Usage: /price <symbol>\nExample: /price XAUUSD' };
  }
  if (!isKnownSymbol(symbol)) {
    return { text: `Unknown symbol: ${symbol}. Try /price XAUUSD or /price EURUSD.` };
  }

  try {
    const { getPriceWithMeta } = await import('@kestrel/data');
    const { tick } = await getPriceWithMeta(symbol);
    const status = tick.marketState === 'closed' ? 'Market closed — last price' : 'Live';
    return {
      text: [
        `📊 ${tick.symbol}`,
        status,
        bullet('Bid', String(tick.bid)),
        bullet('Ask', String(tick.ask)),
        bullet('Mid', String(tick.mid)),
        bullet('Source', tick.source),
        bullet('Updated', new Date(tick.ts).toISOString()),
      ].join('\n'),
    };
  } catch (err) {
    return {
      text: `Could not fetch ${symbol} right now: ${
        err instanceof Error ? err.message : 'market data unavailable'
      }`,
    };
  }
}

export async function newsReply(symbolRaw: string | undefined): Promise<BotReply> {
  try {
    const symbol = symbolRaw?.trim().toUpperCase();
    const articles = await queries.news.listRecentArticles(5, 0, {
      ...(symbol ? { symbol } : {}),
    });
    if (articles.length === 0) return { text: '📭 No recent news available.' };

    const lines = ['📰 Latest market news', ''];
    for (const article of articles) {
      const sentiment =
        article.sentiment === 'positive' ? '🟢' : article.sentiment === 'negative' ? '🔴' : '⚪';
      lines.push(`${sentiment} ${article.title}`);
      lines.push(`   ${article.source} · ${formatDayTime(article.publishedAt)}`);
      if (article.url) lines.push(`   ${article.url}`);
      lines.push('');
    }
    return { text: lines.join('\n').trim() };
  } catch (err) {
    return {
      text: `Could not fetch news: ${err instanceof Error ? err.message : 'unknown error'}`,
    };
  }
}

export async function calendarReply(countRaw: string | undefined): Promise<BotReply> {
  try {
    const limit = countRaw ? Math.min(Math.max(Number.parseInt(countRaw, 10) || 5, 1), 15) : 5;
    const now = Date.now();
    const events = await queries.news.listUpcomingEvents(
      now,
      now + 90 * 24 * 60 * 60 * 1000,
      limit,
    );
    if (events.length === 0) return { text: '📅 No upcoming economic events found.' };

    const lines = ['📅 Upcoming economic events', ''];
    for (const event of events) {
      const impact =
        event.importance === 'high' ? '🔴' : event.importance === 'medium' ? '🟡' : '🟢';
      lines.push(`${impact} ${event.title}`);
      lines.push(
        `   ${event.country} ${event.currency ?? ''} · ${formatDayTime(event.date)}${
          event.forecast !== null ? ` · Forecast ${event.forecast}` : ''
        }`,
      );
      lines.push('');
    }
    return { text: lines.join('\n').trim() };
  } catch (err) {
    return {
      text: `Could not fetch the calendar: ${err instanceof Error ? err.message : 'unknown error'}`,
    };
  }
}

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

export async function alertReply(args: string[], ctx: TelegramBotContext): Promise<BotReply> {
  const [symbolRaw, operator, levelRaw] = args;
  if (!symbolRaw || !operator || !levelRaw) {
    return {
      text: [
        'Usage: /alert <symbol> <operator> <price>',
        'Operators: >, <, >=, <=',
        'Example: /alert XAUUSD > 2700',
      ].join('\n'),
    };
  }

  const symbol = symbolRaw.toUpperCase();
  if (!isKnownSymbol(symbol)) return { text: `Unknown symbol: ${symbol}` };

  const direction =
    operator === '>' || operator === '>='
      ? 'above'
      : operator === '<' || operator === '<='
        ? 'below'
        : null;
  const level = Number.parseFloat(levelRaw);
  if (!direction || !Number.isFinite(level)) {
    return { text: 'Invalid alert. Use /alert XAUUSD > 2700.' };
  }

  try {
    await createAlert({
      userId: ctx.userId,
      rule: { type: 'priceCross', symbol, level, direction },
      // `telegram-bot` is this plugin's own channel, so the alert is
      // delivered by the user's bot rather than the shared server bot.
      channels: ['telegram-bot'],
    });
    return {
      text: `✅ Alert created\n\n${symbol} ${direction === 'above' ? '↑ above' : '↓ below'} ${level}\n\nYou will be notified in this chat.`,
    };
  } catch (err) {
    return {
      text: `Could not create the alert: ${err instanceof Error ? err.message : 'unknown error'}`,
    };
  }
}

export async function unlinkReply(ctx: TelegramBotContext): Promise<BotReply> {
  await unlinkChat(ctx.userId, ctx.tenantId);
  await ctx.saveSettings({ linkedChatId: undefined, linkedAt: undefined });
  return {
    text: '🔓 This chat is no longer linked to Kestrel. Generate a new link from the web app to reconnect.',
  };
}

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
