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

// Economic-calendar actuals refresh. Shared by the worker `fred-actuals` job
// and the `/api/cron/fred-actuals` fallback route:
//   1. Refresh the trailing 7d + upcoming 14d window from BiQuote's zero-key
//      MT5 calendar (populates actual/forecast/revisedPrevious).
//   2. When a FRED key is supplied, backfill legacy `fred:*` rows whose
//      `actual` is still null.

import * as data from '@kestrel/data';

import {
  listFredEventsMissingActual,
  parseFredEventId,
  patchEventActual,
  upsertEvents,
} from '../persistence/calendar';
import type { CronRunOptions } from '../runtime/cron-runner';

/** Look-back window for the observation query (FRED is sometimes late). */
const LOOKBACK_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface RunFredActualsRefreshArgs extends CronRunOptions {
  /** Operator FRED key; when absent only the zero-key BiQuote step runs. */
  fredApiKey?: string | null;
}

export interface FredActualsRefreshResult {
  processed: number;
  biquoteUpserted: number;
  candidates: number;
  filled: number;
  skipped: number;
  errors: Array<{ id: string; message: string }>;
  /** Healthchecks.io ping body, identical for the worker job and web route. */
  note: string;
}

export async function runFredActualsRefresh(
  args: RunFredActualsRefreshArgs = {},
): Promise<FredActualsRefreshResult> {
  const { signal, log } = args;
  const now = Date.now();
  let biquoteUpserted = 0;

  try {
    const events = await data.fetchUpcomingEvents({
      fromMs: now - LOOKBACK_DAYS * DAY_MS,
      toMs: now + 14 * DAY_MS,
      ...(signal ? { signal } : {}),
    });
    const { inserted } = await upsertEvents(events);
    biquoteUpserted = inserted;
    log?.info('biquote calendar actuals refreshed', {
      fetched: events.length,
      upserted: inserted,
    });
  } catch (err) {
    log?.warn('biquote calendar refresh failed (continuing to FRED backfill)', {
      err: err instanceof Error ? err.message : String(err),
    });
  }

  const candidates = args.fredApiKey
    ? await listFredEventsMissingActual({ until: new Date() })
    : [];
  let filled = 0;
  let skipped = 0;
  const errors: Array<{ id: string; message: string }> = [];

  if (!args.fredApiKey) {
    log?.warn('FRED_API_KEY missing — skipping FRED backfill', { biquoteUpserted });
    return {
      processed: biquoteUpserted,
      biquoteUpserted,
      candidates: 0,
      filled,
      skipped,
      errors,
      note:
        biquoteUpserted > 0
          ? `biquote_upserted=${biquoteUpserted}, FRED_API_KEY missing`
          : 'FRED_API_KEY missing',
    };
  }

  for (const ev of candidates) {
    if (signal?.aborted) {
      log?.warn('fred-actuals aborted', {
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
    const meta = data.fred.fredMeta(parsed.releaseId);
    if (!meta?.seriesId) {
      skipped += 1;
      continue;
    }

    try {
      const start = shiftIso(parsed.releaseDate, -LOOKBACK_DAYS);
      const end = shiftIso(parsed.releaseDate, +LOOKBACK_DAYS);
      const obs = await data.fred.fetchObservations({
        apiKey: args.fredApiKey,
        seriesId: meta.seriesId,
        start,
        end,
        ...(signal ? { signal } : {}),
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
      log?.warn('fred-actuals patch failed', { id: ev.id, err: message });
    }
  }

  return {
    processed: biquoteUpserted + candidates.length,
    biquoteUpserted,
    candidates: candidates.length,
    filled,
    skipped,
    errors,
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
