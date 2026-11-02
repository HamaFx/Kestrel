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

// Weekly CFTC Commitment-of-Traders ingestion. Shared by the worker `cot` job
// and the `/api/cron/cot` fallback route, so both paths refresh the trailing
// four weeks identically. Idempotent at (symbol, report_date).

import * as data from '@kestrel/data';
import { CFTC_SUPPORTED_SYMBOLS, type Symbol } from '@kestrel/shared';

import type { CronRunOptions } from '../runtime/cron-runner';
import { upsertCoTReport } from './persistence';

/** Number of weekly rows to refresh on each run. */
const WEEKS = 4;

export interface CotIngestionResult {
  processed: number;
  upserted: number;
  errors: Array<{ symbol: string; message: string }>;
  /** Healthchecks.io ping body, identical for the worker job and web route. */
  note: string;
}

export async function runCotIngestion(args: CronRunOptions = {}): Promise<CotIngestionResult> {
  const { signal, log } = args;
  let processed = 0;
  let upserted = 0;
  const errors: Array<{ symbol: string; message: string }> = [];

  for (const symbol of CFTC_SUPPORTED_SYMBOLS) {
    if (signal?.aborted) {
      log?.warn('cot aborted', { processed, remaining: CFTC_SUPPORTED_SYMBOLS.length - processed });
      break;
    }
    try {
      const rows = await data.cftc.fetchLatestRows({
        commodityName: data.cftc.toCftcName(symbol as Symbol),
        weeks: WEEKS,
        ...(signal ? { signal } : {}),
      });
      for (const row of rows) {
        const date = parseReportDate(row.report_date_as_yyyy_mm_dd);
        if (!date) continue;
        await upsertCoTReport({
          symbol,
          reportDate: date,
          dealerLong: data.cftc.parseCftcInt(row.dealer_positions_long_all),
          dealerShort: data.cftc.parseCftcInt(row.dealer_positions_short_all),
          assetLong: data.cftc.parseCftcInt(row.asset_mgr_positions_long_all),
          assetShort: data.cftc.parseCftcInt(row.asset_mgr_positions_short_all),
          leveragedLong: data.cftc.parseCftcInt(row.lev_money_positions_long_all),
          leveragedShort: data.cftc.parseCftcInt(row.lev_money_positions_short_all),
          otherLong: data.cftc.parseCftcInt(row.other_rept_positions_long_all),
          otherShort: data.cftc.parseCftcInt(row.other_rept_positions_short_all),
          raw: row,
        });
        upserted += 1;
      }
      processed += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push({ symbol, message });
      log?.warn('cot symbol failed', { symbol, err: message });
    }
  }

  return {
    processed,
    upserted,
    errors,
    note: `upserted=${upserted} errors=${errors.length}`,
  };
}

function parseReportDate(s: string): Date | null {
  if (!s || s.length < 10) return null;
  const d = new Date(`${s.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}
