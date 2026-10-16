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

// Calendar adapter tests covering both zero-key BiQuote 54-country MT5
// calendar events and FRED release-dates failover.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchUpcomingEvents } from '../src/adapters/calendar';
import { _resetThrottle } from '../src/cache/throttle';
import { _resetHealth } from '../src/health';

const ORIGINAL_FETCH = globalThis.fetch;

describe('fetchUpcomingEvents (BiQuote zero-key + FRED)', () => {
  beforeEach(() => {
    _resetThrottle();
    _resetHealth();
  });
  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH;
    vi.restoreAllMocks();
  });

  it('fetches 54-country MT5 calendar events from BiQuote without requiring FRED_API_KEY and preserves actual: null', async () => {
    const eventTime = new Date(Date.now() + 3600_000).toISOString();
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            id: 'mql5:900001',
            eventId: 'mql5:840',
            time: eventTime,
            countryCode: 'US',
            currency: 'USD',
            name: 'Nonfarm Payrolls',
            importance: 'high',
            unit: 'job',
            multiplier: 'thousands',
            actual: null,
            forecast: 180000,
            previous: 175000,
            revisedPrevious: 172000,
            source: 'mql5',
          },
          {
            id: 'mql5:900002',
            eventId: 'mql5:999',
            time: eventTime,
            countryCode: 'EU',
            currency: 'EUR',
            name: 'ECB Deposit Facility Rate',
            importance: 'high',
            unit: 'percent',
            multiplier: null,
            actual: 3.5,
            forecast: 3.5,
            previous: 3.75,
            revisedPrevious: null,
            source: 'mql5',
          },
        ]),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    ) as unknown as typeof fetch;

    const events = await fetchUpcomingEvents({ apiKeys: {} });
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      id: 'mql5:900001',
      title: 'Nonfarm Payrolls',
      country: 'US',
      currency: 'USD',
      importance: 'high',
      actual: null,
      forecast: 180000,
      previous: 172000,
      unit: 'job thousands',
      source: 'biquote',
    });
    expect(events[1]).toMatchObject({
      id: 'mql5:900002',
      country: 'EZ',
      currency: 'EUR',
      actual: 3.5,
      previous: 3.75,
      unit: 'percent',
      source: 'biquote',
    });
  });

  it('keeps curated FRED releases and drops unknown ones when apiKeys.fred is provided', async () => {
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const farFuture = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          release_dates: [
            { release_id: 50, release_name: 'Employment Situation', date: future },
            { release_id: 9999, release_name: 'Some random release', date: future },
            { release_id: 10, release_name: 'Consumer Price Index', date: farFuture },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    ) as unknown as typeof fetch;

    const events = await fetchUpcomingEvents({ apiKeys: { fred: 'X' } });
    expect(events).toHaveLength(2);
    expect(events[0]!.id).toMatch(/^fred:50:\d{4}-\d{2}-\d{2}$/);
    expect(events[0]!.title).toBe('Employment Situation (NFP)');
    expect(events[0]!.importance).toBe('high');
    expect(events[0]!.currency).toBe('USD');
  });

  it('events are sorted ascending by date', async () => {
    const today = Date.now();
    const day = (n: number) => new Date(today + n * 86_400_000).toISOString().slice(0, 10);
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          release_dates: [
            { release_id: 50, release_name: 'NFP', date: day(5) },
            { release_id: 10, release_name: 'CPI', date: day(2) },
            { release_id: 21, release_name: 'PCE', date: day(8) },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    ) as unknown as typeof fetch;

    const events = await fetchUpcomingEvents({
      apiKeys: { fred: 'X' },
      toMs: today + 14 * 86_400_000,
    });
    const dates = events.map((e) => e.date);
    expect(dates).toEqual([...dates].sort((a, b) => a - b));
  });
});
