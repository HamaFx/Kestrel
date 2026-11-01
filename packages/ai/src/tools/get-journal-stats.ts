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

// Tool: get_journal_stats.
//
// Reuses `computeStats` for the global block and adds per-symbol +
// per-tag breakdowns via SQL group-bys. Empty filter sets return empty
// breakdown arrays — never throws.
//
// R8 (audit 2026-10-31): win rate, average R and total R are measurements, so
// when nothing has closed / nothing carries an R multiple they are null, not
// 0. A fabricated "average R = 0" or "win rate = 0%" is accepted by the chat's
// numeric evidence gate as fact. Counts stay real integers.

import { requireTenantIdForUser, schema } from '@kestrel/db';
import {
  GetJournalStatsInputSchema,
  type GetJournalStatsOutput,
  type StatBreakdown,
} from '@kestrel/shared';
import { tool, type Tool } from 'ai';
import { and, eq, gte, lte, sql, type SQL } from 'drizzle-orm';
import type { z } from 'zod';

import { computeStats } from '../journal/persistence';
import { getDb } from '../runtime/db';
import { getToolContext, maybeGetToolContext } from '../runtime/tool-context';

const InputSchema = GetJournalStatsInputSchema;

declare module '@kestrel/shared' {
  interface ToolIOMap {
    get_journal_stats: { input: z.infer<typeof InputSchema> };
  }
}

export const getJournalStatsTool: Tool<z.infer<typeof InputSchema>, GetJournalStatsOutput> = tool({
  description:
    "Compute journal stats — count, win rate, average R-multiple, total R — globally and broken down by symbol and by tag. Optional filters: time window (`sinceMs`/`untilMs`, ms epoch), `symbol`, `side`. Use for any 'how am I doing on X' or 'win rate this month' prompt. Returns top breakdowns sorted by trade count. Counts are always real; win rate, average R and total R are null (with a `notes` explanation) when no closed trades or no R multiples exist, so never read a null as a 0.",
  inputSchema: InputSchema,
  execute: async ({ sinceMs, untilMs, symbol, side }): Promise<GetJournalStatsOutput> => {
    const userId = getToolContext().userId;
    const tenantId = await requireTenantIdForUser(userId, maybeGetToolContext()?.db ?? getDb());

    const stats = await computeStats(userId, {
      ...(sinceMs !== undefined ? { sinceMs } : {}),
      ...(untilMs !== undefined ? { untilMs } : {}),
    });

    // The global block follows `computeStats`'s window (since/until only);
    // keep the coverage probe on the same population so the null overrides
    // below line up with `stats`.
    const windowFilters: SQL[] = [
      eq(schema.journalEntries.userId, userId),
      eq(schema.journalEntries.tenantId, tenantId),
    ];
    if (sinceMs !== undefined)
      windowFilters.push(gte(schema.journalEntries.openedAt, new Date(sinceMs)));
    if (untilMs !== undefined)
      windowFilters.push(lte(schema.journalEntries.openedAt, new Date(untilMs)));

    const breakdownFilters = [...windowFilters];
    if (symbol !== undefined) breakdownFilters.push(eq(schema.journalEntries.symbol, symbol));
    if (side !== undefined) breakdownFilters.push(eq(schema.journalEntries.side, side));

    const windowWhere = and(...windowFilters);
    const breakdownWhere = and(...breakdownFilters);

    const [coverage, bySymbol, byTag] = await Promise.all([
      measureCoverage(windowWhere),
      breakdownBySymbol(breakdownWhere),
      breakdownByTag(breakdownWhere),
    ]);

    // R8 (audit 2026-10-31): `summarize()` still collapses these to 0 when
    // nothing was measured. Never let that 0 leave the tool as an observation.
    const winRateUnavailable = coverage.closed === null || coverage.closed === 0;
    const rStatsUnavailable = coverage.withR === null || coverage.withR === 0;
    const notes = buildNotes({
      winRateUnavailable,
      rStatsUnavailable,
      breakdownHasNulls: [...bySymbol, ...byTag].some((b) => b.winRate === null || b.avgR === null),
    });

    return {
      stats: {
        ...stats,
        winRate: winRateUnavailable ? null : stats.winRate,
        avgR: rStatsUnavailable ? null : stats.avgR,
        totalR: rStatsUnavailable ? null : stats.totalR,
      },
      bySymbol,
      byTag,
      ...(notes ? { notes } : {}),
    };
  },
});

// ---------------------------------------------------------------------------
// SQL group-bys
// ---------------------------------------------------------------------------

interface RawBreakdownRow {
  key: string | null;
  count: number | string;
  wins: number | string | null;
  closed: number | string | null;
  avg_r: number | null;
}

interface Coverage {
  /** Closed trades in the window; null when the aggregate could not be read. */
  closed: number | null;
  /** Trades carrying a non-null R multiple; null when unreadable. */
  withR: number | null;
}

/**
 * One aggregate row telling us whether the global block's win rate / average R
 * have anything to stand on. `sum()` is NULL over an empty window, which is a
 * genuine "no closed trades" — coalesce it to 0; `count()` is already 0.
 */
async function measureCoverage(where: SQL | undefined): Promise<Coverage> {
  const db = maybeGetToolContext()?.db ?? getDb();
  const [row] = await db
    .select({
      closed:
        sql<number>`sum(case when ${schema.journalEntries.outcome} <> 'open' then 1 else 0 end)`.as(
          'closed',
        ),
      with_r: sql<number>`count(${schema.journalEntries.rMultiple})`.as('with_r'),
    })
    .from(schema.journalEntries)
    .where(where);
  return { closed: toFiniteNumber(row?.closed ?? 0), withR: toFiniteNumber(row?.with_r ?? 0) };
}

function toFiniteNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

async function breakdownBySymbol(where: SQL | undefined): Promise<StatBreakdown[]> {
  const db = maybeGetToolContext()?.db ?? getDb();
  const rows = await db
    .select({
      key: schema.journalEntries.symbol,
      count: sql<number>`count(*)`.as('count'),
      wins: sql<number>`sum(case when ${schema.journalEntries.outcome} = 'win' then 1 else 0 end)`.as(
        'wins',
      ),
      closed:
        sql<number>`sum(case when ${schema.journalEntries.outcome} <> 'open' then 1 else 0 end)`.as(
          'closed',
        ),
      avg_r: sql<
        number | null
      >`avg(${schema.journalEntries.rMultiple}) filter (where ${schema.journalEntries.rMultiple} is not null)`.as(
        'avg_r',
      ),
    })
    .from(schema.journalEntries)
    .where(where)
    .groupBy(schema.journalEntries.symbol)
    .orderBy(sql`count(*) desc`);

  return rows.map(toBreakdown);
}

async function breakdownByTag(where: SQL | undefined): Promise<StatBreakdown[]> {
  // unnest(tags) explodes one row per tag so the GROUP BY can bucket them.
  const db = maybeGetToolContext()?.db ?? getDb();
  const rows = await db
    .select({
      key: sql<string>`unnest(${schema.journalEntries.tags})`.as('key'),
      count: sql<number>`count(*)`.as('count'),
      wins: sql<number>`sum(case when ${schema.journalEntries.outcome} = 'win' then 1 else 0 end)`.as(
        'wins',
      ),
      closed:
        sql<number>`sum(case when ${schema.journalEntries.outcome} <> 'open' then 1 else 0 end)`.as(
          'closed',
        ),
      avg_r: sql<
        number | null
      >`avg(${schema.journalEntries.rMultiple}) filter (where ${schema.journalEntries.rMultiple} is not null)`.as(
        'avg_r',
      ),
    })
    .from(schema.journalEntries)
    .where(where)
    .groupBy(sql`unnest(${schema.journalEntries.tags})`)
    .orderBy(sql`count(*) desc`);

  return rows.map(toBreakdown);
}

function toBreakdown(r: RawBreakdownRow): StatBreakdown {
  const count = Number(r.count ?? 0);
  const wins = Number(r.wins ?? 0);
  const closed = Number(r.closed ?? 0);
  const avgR = r.avg_r === null || r.avg_r === undefined ? null : Number(r.avg_r);
  return {
    key: r.key ?? '(untagged)',
    count,
    // R8 (audit 2026-10-31): no closed trade means the win rate was never
    // measured. A 0 here would be quoted as "0% win rate".
    winRate: closed === 0 ? null : wins / closed,
    // `avg(...) filter (where r_multiple is not null)` is NULL when every
    // R multiple in the bucket is NULL. That is "not measured", not 0R.
    avgR: avgR !== null && Number.isFinite(avgR) ? avgR : null,
  };
}

function buildNotes(args: {
  winRateUnavailable: boolean;
  rStatsUnavailable: boolean;
  breakdownHasNulls: boolean;
}): string | undefined {
  const reasons: string[] = [];
  if (args.winRateUnavailable) {
    reasons.push('no trade in the window has closed, so the overall win rate is null');
  }
  if (args.rStatsUnavailable) {
    reasons.push(
      'no trade in the window carries an R multiple, so the overall average R and total R are null',
    );
  }
  if (args.breakdownHasNulls) {
    reasons.push(
      'a breakdown win rate or average R is null when that bucket has no closed trade or no R multiple',
    );
  }
  if (reasons.length === 0) return undefined;
  return `Counts are real; unmeasured win rate, average R and total R are null rather than 0 (${reasons.join('; ')}).`;
}
