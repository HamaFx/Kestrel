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

// Assemble one macro evidence item for any research-packet symbol.

import { tryGetSymbolDefinition, type Symbol } from '@kestrel/shared';

import { createEvidenceId } from '../evidence';
import { quarantineExternalText } from '../external-content';
import type { MacroFetchResult } from './fetch';
import {
  EXTERNAL_TITLE_MAX_LENGTH,
  GENERIC_MACRO_COT_WEEKS,
  GENERIC_MACRO_EVENT_LIMIT,
  GENERIC_MACRO_NEWS_LIMIT,
  MACRO_EVENT_LIMIT,
  MACRO_NEWS_LIMIT,
} from './limits';
import {
  MacroEvidenceSchema,
  type MacroCotRow,
  type MacroEvent,
  type MacroEvidence,
  type MacroNewsItem,
} from './schemas';

function netOf(long: number | null, short: number | null): number | null {
  return long === null || short === null ? null : long - short;
}

function latestSeries(
  series: { date: string; value: number }[] | undefined,
): { asOf: string; value: number }[] {
  return (series ?? []).slice(-10).map((point) => ({ asOf: point.date, value: point.value }));
}

/**
 * Turn the best-effort provider settle results into one bounded, quarantined
 * macro item. External title text is untrusted: instruction-like items are
 * skipped and surface as warnings. A completely empty fetch returns a typed
 * gap instead of a fake item.
 */
export function assembleMacroEvidence(args: {
  symbol: Symbol;
  packetId: string;
  generatedAt: string;
  fetched: MacroFetchResult;
}): { macro: MacroEvidence | null; warnings: string[] } {
  const { symbol, generatedAt, fetched } = args;
  const definition = tryGetSymbolDefinition(symbol);
  const supportsEconomicCalendar = definition?.capabilities.supportsEconomicCalendar !== false;
  const supportsCftc = definition?.capabilities.supportsCftc === true;
  const isGold = definition?.category === 'gold';
  const warnings: string[] = [];

  const news = fetched.news.status === 'fulfilled' ? fetched.news.value : [];
  const events = fetched.events.status === 'fulfilled' ? fetched.events.value : [];
  const cotRows = fetched.cot.status === 'fulfilled' ? fetched.cot.value : [];
  const partialGaps: string[] = [];

  if (fetched.news.status === 'rejected') partialGaps.push(`${symbol} macro news is unavailable.`);
  if (supportsEconomicCalendar && fetched.events.status === 'rejected') {
    partialGaps.push('The economic calendar is unavailable.');
  }
  if (supportsCftc && fetched.cot.status === 'rejected') {
    partialGaps.push(`COT positioning for ${symbol} is unavailable.`);
  }
  if (fetched.dollarIndex?.status === 'rejected') {
    partialGaps.push('Dollar-strength data is unavailable.');
  }
  if (fetched.resonance?.status === 'rejected') {
    partialGaps.push('US real-yield and inflation-expectation data is unavailable.');
  }

  const newsLimit = isGold ? MACRO_NEWS_LIMIT : GENERIC_MACRO_NEWS_LIMIT;
  const headlines: MacroNewsItem[] = [];
  let quarantinedNewsCount = 0;
  for (const item of news.slice(0, newsLimit)) {
    const title = quarantineExternalText(item.title, EXTERNAL_TITLE_MAX_LENGTH);
    if (title.quarantined) {
      quarantinedNewsCount += 1;
      continue;
    }
    headlines.push({
      title: title.text,
      ...(item.source ? { source: item.source } : {}),
      ...(Number.isFinite(item.publishedAt)
        ? { publishedAt: new Date(item.publishedAt).toISOString() }
        : {}),
    });
  }
  if (quarantinedNewsCount > 0) {
    warnings.push(
      `${quarantinedNewsCount} macro news item(s) were skipped because instruction-like text was quarantined from the title.`,
    );
  }

  const currencies = new Set(definition?.currencies ?? []);
  const now = Date.parse(generatedAt);
  const eventLimit = isGold ? MACRO_EVENT_LIMIT : GENERIC_MACRO_EVENT_LIMIT;
  const upcoming: MacroEvent[] = [];
  let quarantinedEventCount = 0;
  for (const event of [...events].sort((a, b) => a.date - b.date)) {
    if (event.date < now) continue;
    if (event.currency !== null && currencies.size > 0 && !currencies.has(event.currency)) continue;
    const title = quarantineExternalText(event.title, EXTERNAL_TITLE_MAX_LENGTH);
    if (title.quarantined) {
      quarantinedEventCount += 1;
      continue;
    }
    upcoming.push({
      name: title.text,
      currency: event.currency,
      importance: event.importance ?? null,
      date: new Date(event.date).toISOString(),
      actual: event.actual ?? null,
      forecast: event.forecast ?? null,
      previous: event.previous ?? null,
    });
    if (upcoming.length >= eventLimit) break;
  }
  if (quarantinedEventCount > 0) {
    warnings.push(
      `${quarantinedEventCount} economic calendar item(s) were skipped because instruction-like text was quarantined from the title.`,
    );
  }

  const cot: MacroCotRow[] | undefined = supportsCftc
    ? cotRows.slice(-GENERIC_MACRO_COT_WEEKS).map((row) => ({
        reportDate: new Date(row.reportDate).toISOString(),
        dealerNet: netOf(row.dealerLong, row.dealerShort),
        assetNet: netOf(row.assetLong, row.assetShort),
        leveragedNet: netOf(row.leveragedLong, row.leveragedShort),
        otherNet: netOf(row.otherLong, row.otherShort),
      }))
    : undefined;

  const dollarIndex =
    fetched.dollarIndex?.status === 'fulfilled'
      ? latestSeries(fetched.dollarIndex.value)
      : undefined;
  const resonance = fetched.resonance?.status === 'fulfilled' ? fetched.resonance.value : undefined;
  const realYields = latestSeries(resonance?.realYields);
  const breakevenInflation = latestSeries(resonance?.breakevenInflation);
  const hasFredSeries =
    (dollarIndex?.length ?? 0) > 0 || realYields.length > 0 || breakevenInflation.length > 0;
  const fredSeries = hasFredSeries
    ? { dollarIndex: dollarIndex ?? [], realYields, breakevenInflation }
    : undefined;

  const hasAnyData =
    headlines.length > 0 ||
    upcoming.length > 0 ||
    (cot !== undefined && cot.length > 0) ||
    fredSeries !== undefined;
  if (!hasAnyData) {
    return {
      macro: null,
      warnings: [
        `Macro unavailable: news, calendar, COT, and rate data providers returned no data for ${symbol}.`,
        ...partialGaps,
      ],
    };
  }

  const macroWarnings = [...warnings, ...partialGaps];
  if (partialGaps.length > 0) {
    macroWarnings.push('Macro context is partial because one or more providers were unavailable.');
  }

  const sources = ['finnhub', 'marketaux'];
  if (supportsEconomicCalendar) sources.push('biquote-calendar');
  if (supportsCftc) sources.push('cftc');
  if (fredSeries) sources.push('fred');

  const macro = MacroEvidenceSchema.parse({
    evidenceId: createEvidenceId('macro', symbol),
    source: sources.join('/'),
    news: headlines,
    events: upcoming,
    ...(cot && cot.length > 0 ? { cot } : {}),
    ...(fredSeries ? { fredSeries } : {}),
    warnings: macroWarnings,
  });
  return { macro, warnings: macroWarnings };
}
