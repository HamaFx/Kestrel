/**
 * Copyright 2026 Kestrel
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 */

// Metrics flush — pushes the in-process metrics registry to the configured
// Grafana Cloud transports once a minute. When the legacy tick stream is
// active (or a recent row <5m old exists in `live_ticks`), it also records
// `worker_tick_freshness_ms`. Stale historical rows (>5m old when
// `WORKER_ENABLE_TICK_STREAM=0`) are ignored so on-demand REST mode never
// emits false stale-tick alerts.

import { getDb } from '@kestrel/ai';
import { liveTicks } from '@kestrel/db/schema';
import { metrics } from '@kestrel/shared';
import { flushMetrics } from '@kestrel/shared/metrics-export';
import { desc } from 'drizzle-orm';

import type { JobContext, JobResult } from './types.js';

const ON_DEMAND_STALE_IGNORE_MS = 300_000;

export async function runMetricsFlush(ctx: JobContext): Promise<JobResult> {
  metrics.increment('worker_flush_total');

  const tickStreamEnabled =
    process.env.WORKER_ENABLE_TICK_STREAM === '1' ||
    process.env.WORKER_ENABLE_TICK_STREAM === 'true';

  let freshnessMs: number | null = null;
  try {
    const [row] = await getDb()
      .select({ ts: liveTicks.ts })
      .from(liveTicks)
      .orderBy(desc(liveTicks.ts))
      .limit(1);
    if (row?.ts) {
      const candidateMs = Math.max(0, Date.now() - new Date(row.ts).getTime());
      if (tickStreamEnabled || candidateMs <= ON_DEMAND_STALE_IGNORE_MS) {
        freshnessMs = candidateMs;
        metrics.observe('worker_tick_freshness_ms', freshnessMs);
      }
    }
  } catch (err) {
    ctx.log.warn('tick freshness probe failed', { err: String(err) });
  }

  await flushMetrics();

  return {
    processed: 1,
    note: `tick_freshness_ms=${freshnessMs === null ? 'no-ticks' : freshnessMs}`,
  };
}
