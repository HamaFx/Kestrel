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
  type EconomicEvent,
  type NewsArticle,
} from '@kestrel/shared';

import { XAUUSD, XauusdMacroEvidenceSchema, type XauusdMacroEvidence } from '../shared/types';
import { createEvidenceId, qualityFromWarnings } from './evidence';
import { quarantineExternalText } from './external-content';

const MACRO_WINDOW_DAYS = 30;
const CALENDAR_WINDOW_DAYS = 7;
const EXTERNAL_TITLE_MAX_LENGTH = 240;
const EXTERNAL_SUMMARY_MAX_LENGTH = 1_800;

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
