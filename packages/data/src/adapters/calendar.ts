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

// Calendar adapter — zero-key BiQuote 54-country MT5 Economic Calendar primary
// with FRED release-dates failover/merge.
//
// BiQuote (`GET /api/calendar`) provides 90 days of history and 90 days forward
// across 54 countries with `actual`, `forecast`, `previous`, and `revisedPrevious`
// (where `actual: null` means not yet published, never 0).

import {
  EconomicEventSchema,
  type BiquoteCalendarEvent,
  type EconomicEvent,
  type Importance,
} from '@kestrel/shared';

import { runWithFailover, type ProviderAttempt } from '../failover';
import * as biquote from '../providers/biquote';
import { fetchReleaseDates, FRED_RELEASES, fredMeta } from '../providers/fred';

export interface FetchCalendarOptions {
  /** Window start (default: now). */
  fromMs?: number;
  /** Window end (default: now + 14 days). */
  toMs?: number;
  /** Comma-separated ISO country codes (default: G8 catalog countries). */
  countries?: string;
  /** Optional minimum/exact importance filter. */
  importance?: Importance;
  /** Maximum events to request from BiQuote (1..500, default 200). */
  limit?: number;
  signal?: AbortSignal;
  apiKeys?: Partial<{ fred: string; biquoteBaseUrl: string }>;
}

const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;
const DEFAULT_G8_COUNTRIES = 'US,EU,GB,JP,CA,AU,NZ,CH';

const COUNTRY_TO_CURRENCY: Record<string, string> = {
  US: 'USD',
  EU: 'EUR',
  EZ: 'EUR',
  DE: 'EUR',
  FR: 'EUR',
  GB: 'GBP',
  UK: 'GBP',
  JP: 'JPY',
  CA: 'CAD',
  AU: 'AUD',
  NZ: 'NZD',
  CH: 'CHF',
};

function resolveKeys(opts: FetchCalendarOptions) {
  return {
    fred: opts.apiKeys?.fred ?? process.env.FRED_API_KEY ?? '',
    biquoteBaseUrl:
      opts.apiKeys?.biquoteBaseUrl ?? process.env.BIQUOTE_BASE_URL ?? 'https://biquote.io',
  };
}

function isoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function normalizeCountryCode(code: string): string {
  const upper = code.trim().toUpperCase();
  if (upper === 'EU') return 'EZ';
  if (upper === 'GB') return 'UK';
  return upper;
}

function mapBiquoteEvent(ev: BiquoteCalendarEvent): EconomicEvent | null {
  const dateMs = Date.parse(ev.time);
  if (Number.isNaN(dateMs)) return null;

  const country = normalizeCountryCode(ev.countryCode);
  const currency =
    ev.currency?.trim().toUpperCase() || COUNTRY_TO_CURRENCY[ev.countryCode.toUpperCase()] || null;
  const unitParts = [ev.unit, ev.multiplier].filter((part): part is string => Boolean(part));
  const unit = unitParts.length > 0 ? unitParts.join(' ') : null;

  // Per BiQuote docs: `actual: null` means not yet published (never coerce to 0),
  // and `revisedPrevious` supersedes `previous` when present.
  return EconomicEventSchema.parse({
    id: ev.id,
    title: ev.name,
    country,
    currency,
    importance: ev.importance,
    date: dateMs,
    actual: ev.actual ?? null,
    forecast: ev.forecast ?? null,
    previous: ev.revisedPrevious ?? ev.previous ?? null,
    unit,
    source: 'biquote',
  });
}

async function fetchFromBiquote(
  fromMs: number,
  toMs: number,
  opts: FetchCalendarOptions,
  baseUrl: string,
): Promise<EconomicEvent[]> {
  const raw = await biquote.fetchCalendar({
    from: new Date(fromMs).toISOString(),
    to: new Date(toMs).toISOString(),
    countries: opts.countries ?? DEFAULT_G8_COUNTRIES,
    ...(opts.importance ? { importance: opts.importance } : {}),
    limit: opts.limit ?? 200,
    baseUrl,
    ...(opts.signal ? { signal: opts.signal } : {}),
  });

  const out: EconomicEvent[] = [];
  for (const item of raw) {
    const mapped = mapBiquoteEvent(item);
    if (!mapped) continue;
    if (mapped.date < fromMs || mapped.date > toMs) continue;
    out.push(mapped);
  }
  return out.sort((a, b) => a.date - b.date);
}

async function fetchFromFred(
  fromMs: number,
  toMs: number,
  apiKey: string,
  signal?: AbortSignal,
): Promise<EconomicEvent[]> {
  const releaseDates = await fetchReleaseDates({
    apiKey,
    from: isoDate(fromMs),
    to: isoDate(toMs),
    ...(signal ? { signal } : {}),
  });

  const out: EconomicEvent[] = [];
  for (const r of releaseDates) {
    const meta = fredMeta(r.release_id);
    if (!meta) continue;
    const dateMs = Date.parse(`${r.date}T13:30:00Z`);
    if (Number.isNaN(dateMs)) continue;
    if (dateMs < fromMs || dateMs > toMs) continue;
    out.push(
      EconomicEventSchema.parse({
        id: `fred:${r.release_id}:${r.date}`,
        title: meta.title,
        country: meta.country,
        currency: meta.currency,
        importance: meta.importance,
        date: dateMs,
        actual: null,
        forecast: null,
        previous: null,
        unit: null,
        source: 'fred',
      }),
    );
  }
  return out.sort((a, b) => a.date - b.date);
}

/**
 * Build the upcoming events list using BiQuote's zero-key 54-country MT5
 * calendar as primary and FRED as failover (or primary when `apiKeys.fred`
 * is explicitly injected by caller/tests).
 */
export async function fetchUpcomingEvents(
  opts: FetchCalendarOptions = {},
): Promise<EconomicEvent[]> {
  const keys = resolveKeys(opts);
  const fromMs = opts.fromMs ?? Date.now();
  const toMs = opts.toMs ?? fromMs + FOURTEEN_DAYS_MS;

  const biquoteAttempt: ProviderAttempt<EconomicEvent[]> = {
    name: 'biquote',
    run: () => fetchFromBiquote(fromMs, toMs, opts, keys.biquoteBaseUrl),
  };

  const fredAttempt: ProviderAttempt<EconomicEvent[]> | null = keys.fred
    ? {
        name: 'fred',
        // Pin FRED when the caller explicitly passed apiKeys.fred (e.g. FRED-specific unit tests).
        pinned: Boolean(opts.apiKeys?.fred),
        run: () => fetchFromFred(fromMs, toMs, keys.fred, opts.signal),
      }
    : null;

  const attempts: ProviderAttempt<EconomicEvent[]>[] = fredAttempt
    ? opts.apiKeys?.fred
      ? [fredAttempt, biquoteAttempt]
      : [biquoteAttempt, fredAttempt]
    : [biquoteAttempt];

  const { value } = await runWithFailover(attempts, { signal: opts.signal });
  return value;
}

/** Convenience: ids of releases we know about (UI / tests). */
export const CURATED_FRED_RELEASE_IDS = Object.keys(FRED_RELEASES).map(Number);
