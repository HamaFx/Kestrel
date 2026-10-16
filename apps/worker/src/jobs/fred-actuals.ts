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

// Phase 8 PR-13 + BiQuote Calendar Actuals Backfill:
//   1. Refreshes the trailing 7d + upcoming 14d window from BiQuote's
//      zero-key 54-country MT5 Economic Calendar (`fetchUpcomingEvents` +
//      `upsertEvents`), which populates `actual`, `forecast`, and
//      `revisedPrevious` directly from MetaTrader 5 without requiring an API key.
//   2. When `FRED_API_KEY` is configured, also backfills any legacy `fred:*`
//      rows whose `actual` is still null.

import * as ai from '@kestrel/ai';
import * as data from '@kestrel/data';

import type { JobContext, JobResult } from './types.js';

const { listFredEventsMissingActual, parseFredEventId, patchEventActual } = ai;
const { fetchObservations, fredMeta } = data.fred;

/** Look-back window for the observation query (FRED is sometimes late). */
const LOOKBACK_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

export async function runFredActuals(ctx: JobContext): Promise<JobResult> {
  const log = ctx.log;
  const now = Date.now();
  let biquoteUpserted = 0;

  // Step 1: Zero-key BiQuote calendar refresh when wired in runtime
  if (typeof data.fetchUpcomingEvents === 'function' && typeof ai.upsertEvents === 'function') {
    try {
      const events = await data.fetchUpcomingEvents({
        fromMs: now - LOOKBACK_DAYS * DAY_MS,
        toMs: now + 14 * DAY_MS,
        ...(ctx.signal ? { signal: ctx.signal } : {}),
      });
      const { inserted } = await ai.upsertEvents(events);
      biquoteUpserted = inserted;
      log.info('biquote calendar actuals refreshed', {
        fetched: events.length,
        upserted: inserted,
      });
    } catch (err) {
      log.warn('biquote calendar refresh failed (continuing to FRED backfill)', {
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const apiKey = process.env['FRED_API_KEY'];
  if (!apiKey) {
    if (biquoteUpserted > 0) {
      log.info('FRED_API_KEY missing — completed via zero-key BiQuote calendar refresh', {
        biquoteUpserted,
      });
      return {
        processed: biquoteUpserted,
        note: `biquote_upserted=${biquoteUpserted}, FRED_API_KEY missing`,
      };
    }
    log.warn('FRED_API_KEY missing — skipping');
    return { processed: 0, note: 'FRED_API_KEY missing' };
  }

  const candidates = await listFredEventsMissingActual({ until: new Date() });
  let filled = 0;
  let skipped = 0;
  const errors: Array<{ id: string; message: string }> = [];

  for (const ev of candidates) {
    if (ctx.signal?.aborted) {
      log.warn('fred-actuals aborted', {
        filled,
        skipped,
        remaining: candidates.length - filled - skipped,
      });
      break;
    }

    const parsed = parseFredEventId(ev.id);
    if (!parsed) {
      skipped += 1;
      continue;
    }
    const meta = fredMeta(parsed.releaseId);
    if (!meta?.seriesId) {
      skipped += 1;
      continue;
    }

    try {
      const start = shiftIso(parsed.releaseDate, -LOOKBACK_DAYS);
      const end = shiftIso(parsed.releaseDate, +LOOKBACK_DAYS);
      const obs = await fetchObservations({
        apiKey,
        seriesId: meta.seriesId,
        start,
        end,
      });
      if (obs.length === 0) continue;

      // Pick the observation closest to the release date.
      const target = parsed.releaseDate;
      obs.sort(
        (a, b) => Math.abs(daysBetween(a.date, target)) - Math.abs(daysBetween(b.date, target)),
      );
      const pick = obs[0]!;
      await patchEventActual(ev.id, pick.value, new Date());
      filled += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push({ id: ev.id, message });
      log.error('fred-actuals patch failed', { id: ev.id, err: message });
    }
  }

  log.info('fred-actuals complete', {
    biquoteUpserted,
    candidates: candidates.length,
    filled,
    skipped,
    errors: errors.length,
  });
  return {
    processed: biquoteUpserted + candidates.length,
    note: `filled=${filled}, skipped=${skipped}, errors=${errors.length}`,
  };
}

function shiftIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysBetween(a: string, b: string): number {
  const da = Date.parse(`${a}T00:00:00Z`);
  const db = Date.parse(`${b}T00:00:00Z`);
  return (da - db) / (24 * 60 * 60 * 1000);
}
