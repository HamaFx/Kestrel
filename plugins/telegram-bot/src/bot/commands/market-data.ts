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

// Market-data commands: /price, /news and /calendar.

import { queries } from '@kestrel/db';
import { isKnownSymbol } from '@kestrel/shared';

import type { BotReply } from '../types';
import { bullet, formatDayTime } from './shared';

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
