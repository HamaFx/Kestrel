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

import { fetchNews, fetchUpcomingEvents } from '@kestrel/data';
import { fetchObservations, fetchResonanceInputs } from '@kestrel/data/providers/fred';
import {
  EconomicEventSchema,
  NewsArticleSchema,
  tryGetSymbolDefinition,
  type EconomicEvent,
  type NewsArticle,
  type Symbol,
} from '@kestrel/shared';
import { z } from 'zod';

import { listCoTSamples } from '../../cot/persistence';
import { XAUUSD, XauusdMacroEvidenceSchema, type XauusdMacroEvidence } from '../shared/types';
import { createEvidenceId, qualityFromWarnings } from './evidence';
import { quarantineExternalText } from './external-content';

const MACRO_WINDOW_DAYS = 30;
const CALENDAR_WINDOW_DAYS = 7;
const EXTERNAL_TITLE_MAX_LENGTH = 240;
const EXTERNAL_SUMMARY_MAX_LENGTH = 1_800;

/**
 * M-02 (audit 2026-10-18) — generic macro extension for non-XAUUSD symbols.
 * The fundamental/risk/sentiment desks previously saw candles only for
 * forex/crypto; this extension carries the macro evidence they are prompted
 * to reason about: recent headlines, the next high-impact calendar releases
 * for the symbol's currencies, and (when the instrument supports it) the
 * latest CFTC positioning rows.
 *
 * Defined here (not in `symbol-research.ts`) so the assembler can parse its
 * own output without an import cycle; `symbol-research.ts` re-exports the
 * schema and type alongside `XauusdExtension`.
 */
export const GenericMacroExtensionSchema = z.object({
  evidenceId: z.string().min(1),
  source: z.string().min(1),
  news: z
    .array(
      z.object({
        title: z.string().min(1),
        source: z.string().optional(),
        publishedAt: z.string().optional(),
      }),
    )
    .max(3),
  events: z
    .array(
      z.object({
        name: z.string().min(1),
        currency: z.string().nullable(),
        importance: z.string().nullable(),
        date: z.string().min(1),
        actual: z.number().nullable(),
        forecast: z.number().nullable(),
        previous: z.number().nullable(),
      }),
    )
    .max(5),
  cot: z
    .array(
      z.object({
        reportDate: z.string().min(1),
        dealerNet: z.number().nullable(),
        assetNet: z.number().nullable(),
        leveragedNet: z.number().nullable(),
        otherNet: z.number().nullable(),
      }),
    )
    .max(3)
    .optional(),
  warnings: z.array(z.string()),
});
export type GenericMacroExtension = z.infer<typeof GenericMacroExtensionSchema>;

export interface GenericMacroFetchResult {
  news: PromiseSettledResult<Awaited<ReturnType<typeof fetchNews>>>;
  events: PromiseSettledResult<Awaited<ReturnType<typeof fetchUpcomingEvents>>>;
  cot: PromiseSettledResult<Awaited<ReturnType<typeof listCoTSamples>>>;
}

const GENERIC_MACRO_NEWS_LIMIT = 3;
const GENERIC_MACRO_EVENT_LIMIT = 5;
const GENERIC_MACRO_COT_WEEKS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface XauusdMacroFetchResult {
  news: PromiseSettledResult<Awaited<ReturnType<typeof fetchNews>>>;
  events: PromiseSettledResult<Awaited<ReturnType<typeof fetchUpcomingEvents>>>;
  dollarIndex: PromiseSettledResult<Awaited<ReturnType<typeof fetchObservations>>>;
  resonance: PromiseSettledResult<Awaited<ReturnType<typeof fetchResonanceInputs>>>;
}

function isoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function providerError(message: string): Error {
  const error = new Error(message);
  error.name = 'MacroProviderUnavailable';
  return error;
}

/** Collect optional macro inputs in parallel; missing providers remain typed gaps. */
export async function fetchXauusdMacroData(signal?: AbortSignal): Promise<XauusdMacroFetchResult> {
  const now = Date.now();
  const fredKey = process.env.FRED_API_KEY ?? '';
  const start = isoDate(now - MACRO_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const end = isoDate(now);

  const [news, events, dollarIndex, resonance] = await Promise.allSettled([
    fetchNews({
      symbol: XAUUSD,
      limit: 8,
      publishedAfter: `${start}T00:00:00.000Z`,
      ...(signal ? { signal } : {}),
    }),
    fetchUpcomingEvents({
      fromMs: now,
      toMs: now + CALENDAR_WINDOW_DAYS * 24 * 60 * 60 * 1000,
      ...(signal ? { signal } : {}),
    }),
    fredKey
      ? fetchObservations({
          apiKey: fredKey,
          seriesId: 'DTWEXBGS',
          start,
          end,
          ...(signal ? { signal } : {}),
        })
      : Promise.reject(providerError('FRED_API_KEY is not configured')),
    fredKey
      ? fetchResonanceInputs({ apiKey: fredKey, start, end, ...(signal ? { signal } : {}) })
      : Promise.reject(providerError('FRED_API_KEY is not configured')),
  ]);

  return { news, events, dollarIndex, resonance };
}

/**
 * M-02 — collect the generic macro inputs for a non-XAUUSD symbol in
 * parallel. Every source is best-effort: a rejected provider becomes a typed
 * gap in `assembleGenericMacroExtension` and never fails the packet.
 * Instruments without an economic-calendar or CFTC pipeline (crypto) resolve
 * an empty list instead of querying irrelevant providers.
 */
export async function fetchGenericMacroData(
  symbol: Symbol,
  signal?: AbortSignal,
): Promise<GenericMacroFetchResult> {
  const definition = tryGetSymbolDefinition(symbol);
  const now = Date.now();

  const eventsPromise: Promise<EconomicEvent[]> =
    definition && !definition.capabilities.supportsEconomicCalendar
      ? Promise.resolve([])
      : fetchUpcomingEvents({
          fromMs: now,
          toMs: now + CALENDAR_WINDOW_DAYS * DAY_MS,
          ...(signal ? { signal } : {}),
        });
  const cotPromise =
    definition && !definition.capabilities.supportsCftc
      ? Promise.resolve([])
      : listCoTSamples({ symbol, weeks: GENERIC_MACRO_COT_WEEKS });

  const [news, events, cot] = await Promise.allSettled([
    fetchNews({ symbol, limit: GENERIC_MACRO_NEWS_LIMIT, ...(signal ? { signal } : {}) }),
    eventsPromise,
    cotPromise,
  ]);
  return { news, events, cot };
}

function netOf(long: number | null, short: number | null): number | null {
  return long === null || short === null ? null : long - short;
}

/**
 * M-02 — turn the generic macro providers into one bounded, quarantined
 * extension. Mirrors the XAUUSD macro assembly rules: external title text is
 * quarantined before parsing (instruction-like items are skipped and surface
 * as warnings), and a completely empty fetch returns a typed gap instead of
 * a fake extension.
 *
 * The returned `warnings` are consumed by the packet only when `extension` is
 * null (the "macro unavailable" disclosure); with an extension present the
 * partial-provider warnings travel inside the extension, exactly like the
 * XAUUSD path.
 */
export function assembleGenericMacroExtension(
  symbol: Symbol,
  fetched: GenericMacroFetchResult,
): { extension: GenericMacroExtension | null; warnings: string[] } {
  const warnings: string[] = [];
  const definition = tryGetSymbolDefinition(symbol);
  const supportsEconomicCalendar = definition?.capabilities.supportsEconomicCalendar !== false;
  const supportsCftc = definition?.capabilities.supportsCftc === true;

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

  // External news text is untrusted data; quarantine before it can reach the
  // prompt as evidence (audit plan §1.11 / P1-8 parity with the XAUUSD path).
  const headlines: GenericMacroExtension['news'] = [];
  let quarantinedNewsCount = 0;
  for (const item of news.slice(0, GENERIC_MACRO_NEWS_LIMIT)) {
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

  // The next high-impact releases for the symbol's own currencies — the
  // fundamental/risk desks reason about this instrument, not the G8 board.
  const currencies = new Set(definition?.currencies ?? []);
  const now = Date.now();
  const upcoming: GenericMacroExtension['events'] = [];
  for (const event of [...events].sort((a, b) => a.date - b.date)) {
    if (event.date < now) continue;
    if (event.currency !== null && !currencies.has(event.currency)) continue;
    const title = quarantineExternalText(event.title, EXTERNAL_TITLE_MAX_LENGTH);
    if (title.quarantined) continue;
    upcoming.push({
      name: title.text,
      currency: event.currency,
      importance: event.importance ?? null,
      date: new Date(event.date).toISOString(),
      actual: event.actual ?? null,
      forecast: event.forecast ?? null,
      previous: event.previous ?? null,
    });
    if (upcoming.length >= GENERIC_MACRO_EVENT_LIMIT) break;
  }

  const cot: GenericMacroExtension['cot'] = supportsCftc
    ? cotRows.slice(-GENERIC_MACRO_COT_WEEKS).map((row) => ({
        reportDate: new Date(row.reportDate).toISOString(),
        dealerNet: netOf(row.dealerLong, row.dealerShort),
        assetNet: netOf(row.assetLong, row.assetShort),
        leveragedNet: netOf(row.leveragedLong, row.leveragedShort),
        otherNet: netOf(row.otherLong, row.otherShort),
      }))
    : undefined;

  const hasAnyData =
    headlines.length > 0 || upcoming.length > 0 || (cot !== undefined && cot.length > 0);
  if (!hasAnyData) {
    return {
      extension: null,
      warnings: [
        `Macro unavailable: news, calendar, and COT providers returned no data for ${symbol}.`,
        ...partialGaps,
      ],
    };
  }
  const extensionWarnings = [...warnings, ...partialGaps];
  if (partialGaps.length > 0) {
    extensionWarnings.push(
      'Generic macro context is partial because one or more providers were unavailable.',
    );
  }

  const extension = GenericMacroExtensionSchema.parse({
    evidenceId: createEvidenceId('macro', symbol),
    source: 'finnhub/marketaux/biquote/biquote-calendar/cftc',
    news: headlines,
    events: upcoming,
    ...(cot && cot.length > 0 ? { cot } : {}),
    warnings: extensionWarnings,
  });
  return { extension, warnings: extensionWarnings };
}

function latestTimestamp(
  generatedAt: string,
  news: readonly { publishedAt: number }[],
  observations: readonly { date: string }[],
): number {
  const timestamps = [
    ...news.map((item) => item.publishedAt),
    ...observations.map((item) => Date.parse(item.date)),
  ].filter((value) => Number.isFinite(value));
  const generatedMs = Date.parse(generatedAt);
  return timestamps.length > 0
    ? Math.max(...timestamps)
    : Number.isFinite(generatedMs)
      ? generatedMs
      : Date.now();
}

/** Turn optional provider results into one provenance-bearing macro evidence item. */
export function assembleXauusdMacroEvidence(
  packetId: string,
  generatedAt: string,
  fetched: XauusdMacroFetchResult,
): { evidence: XauusdMacroEvidence | null; missingData: string[]; warnings: string[] } {
  const missingData: string[] = [];
  const warnings: string[] = [];
  const news = fetched.news.status === 'fulfilled' ? fetched.news.value : [];
  const events = fetched.events.status === 'fulfilled' ? fetched.events.value : [];
  const dollarIndex = fetched.dollarIndex.status === 'fulfilled' ? fetched.dollarIndex.value : [];
  const resonance =
    fetched.resonance.status === 'fulfilled'
      ? fetched.resonance.value
      : { realYields: [], breakevenInflation: [] };

  if (fetched.news.status === 'rejected') missingData.push('Gold-relevant news is unavailable.');
  if (fetched.events.status === 'rejected')
    missingData.push('The economic calendar is unavailable.');
  if (fetched.dollarIndex.status === 'rejected')
    missingData.push('Dollar-strength data is unavailable.');
  if (fetched.resonance.status === 'rejected')
    missingData.push('US real-yield and inflation-expectation data is unavailable.');

  // Audit plan §1.11 / P1-8 — external news and calendar text is untrusted
  // data. Quarantine every title/summary BEFORE parsing so instruction-like
  // payloads embedded in provider content can never reach the packet as
  // evidence. A rejected item is skipped entirely and surfaces as a warning
  // instead of being partially trusted.
  const parsedNews: NewsArticle[] = [];
  let quarantinedNewsCount = 0;
  for (const item of news) {
    const title = quarantineExternalText(item.title, EXTERNAL_TITLE_MAX_LENGTH);
    const summary =
      typeof item.summary === 'string'
        ? quarantineExternalText(item.summary, EXTERNAL_SUMMARY_MAX_LENGTH)
        : null;
    if (title.quarantined || (summary?.quarantined ?? false)) {
      quarantinedNewsCount += 1;
      continue;
    }
    parsedNews.push(
      NewsArticleSchema.parse({
        ...item,
        title: title.text,
        ...(summary ? { summary: summary.text } : {}),
      }),
    );
  }
  const parsedEvents: EconomicEvent[] = [];
  let quarantinedEventCount = 0;
  for (const item of events) {
    const title = quarantineExternalText(item.title, EXTERNAL_TITLE_MAX_LENGTH);
    if (title.quarantined) {
      quarantinedEventCount += 1;
      continue;
    }
    parsedEvents.push(EconomicEventSchema.parse({ ...item, title: title.text }));
  }
  if (quarantinedNewsCount > 0) {
    warnings.push(
      `${quarantinedNewsCount} gold-relevant news item(s) were skipped because instruction-like text was quarantined from a title or summary.`,
    );
  }
  if (quarantinedEventCount > 0) {
    warnings.push(
      `${quarantinedEventCount} economic calendar item(s) were skipped because instruction-like text was quarantined from the title.`,
    );
  }
  const allObservations = [
    ...dollarIndex,
    ...resonance.realYields,
    ...resonance.breakevenInflation,
  ];
  const hasAnyData = parsedNews.length > 0 || parsedEvents.length > 0 || allObservations.length > 0;
  if (!hasAnyData) {
    missingData.push('No macro evidence was returned by the configured providers.');
    return { evidence: null, missingData, warnings };
  }

  if (missingData.length > 0)
    warnings.push('Macro context is partial because one or more providers were unavailable.');

  const observations = allObservations.map((item) => item.date);
  const dataAsOf = new Date(
    latestTimestamp(
      generatedAt,
      parsedNews,
      observations.map((date) => ({ date })),
    ),
  ).toISOString();
  const evidence = XauusdMacroEvidenceSchema.parse({
    evidenceId: createEvidenceId('macro', XAUUSD),
    kind: 'macro',
    symbol: XAUUSD,
    source: 'finnhub/marketaux/fred',
    fetchedAt: generatedAt,
    dataAsOf,
    freshness: 'fresh',
    quality: qualityFromWarnings(warnings),
    warnings,
    trust: 'mixed',
    data: {
      news: parsedNews,
      events: parsedEvents,
      dollarIndex,
      realYields: resonance.realYields,
      breakevenInflation: resonance.breakevenInflation,
    },
  });
  return { evidence, missingData, warnings };
}
