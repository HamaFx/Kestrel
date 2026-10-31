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

/**
 * Phase D — durable, typed counters and histograms.
 *
 * A dependency-free in-process metrics registry so the AI and worker flows
 * can record SLIs (request/tool/budget counts, TTFB, latency, cost) with a
 * stable, typed metric name instead of ad-hoc log fields. The snapshot is
 * JSON-serializable and can be pushed to any backend (Prometheus exporter,
 * Langfuse, health payload) later without changing the call sites.
 *
 * This intentionally stays vendor-neutral, matching the event/span
 * envelopes in `observability.ts`. Exact percentiles need a reservoir, so
 * the registry tracks fixed cumulative buckets instead — enough for
 * `histogram_quantile`-style p50/p95 estimates in Grafana.
 */

/** Stable metric names for AI and queued-analysis SLIs. */
export const METRIC_NAMES = [
  'chat_request_total',
  'chat_turn_total',
  'tool_call_total',
  'tool_fail_total',
  'provider_fallback_total',
  'provider_attempt_failed_total',
  'budget_reserved_total',
  'budget_release_failed_total',
  'agent_failed_total',
  // Subscription + credit billing (plan §14).
  'credits_granted_total',
  'credits_consumed_total',
  'credits_rejected_insufficient_total',
  'checkout_completed_total',
  'webhook_processed_total',
  'dlq_size',
  // Audit plan §1.4/§1.6 — fusion verifier and shared circuit breaker.
  'committee_fusion_verification_total',
  'committee_fusion_verification_failed_total',
  'circuit_open_total',
  'circuit_breaker_db_unavailable_total',
  // Audit plan v2 §5.2 — committee grounding + canonical evidence gates.
  'committee_opinion_verification_total',
  'committee_grounding_rejected_total',
  'canonical_evidence_blocked_total',
  // Audit plan §2.1 — packet cache SLIs.
  'packet_cache_hit_total',
  'packet_cache_miss_total',
  // Audit plan §5.4 — per-committee-step observability.
  'committee_step_latency_ms',
  'committee_step_cost_usd',
  'run_failed_total',
  'ttft_ms',
  // Audit plan §2.4 — canonical-chat setup phase latency (per phase tag).
  'mastra_setup_latency_ms',
  'total_latency_ms',
  'turn_cost_usd',
  // Exporter + worker health signals.
  'metrics_flush_failed_total',
  'worker_flush_total',
  'worker_tick_freshness_ms',
  // Eval/training loop signals.
  'dataset_publish_total',
  'eval_case_total',
  // Mastra proof-of-concept lifecycle and tool SLIs.
  'mastra_run_total',
  'mastra_run_failed_total',
  'mastra_tool_call_total',
  'mastra_tool_failed_total',
  'mastra_research_packet_total',
  'mastra_research_packet_blocked_total',
  'mastra_report_verification_total',
  'mastra_report_verification_failed_total',
  'mastra_report_repair_total',
  'mastra_chat_route_total',
  'mastra_chat_fallback_total',
  'mastra_mode_route_total',
  'mastra_mode_fallback_total',
  // Phase 5 — durability, cancellation, and guardrail health signals.
  'queue_duplicate_claim_total',
  'queue_stale_lease_completion_total',
  'mutation_replay_conflict_total',
  'budget_stranded_total',
  'stream_abort_release_total',
  'guardrail_degraded_total',
  'scorer_missing_input_total',
  'mastra_unpriced_model_total',
  'mastra_telemetry_degraded_total',
  // Audit plan §1.11 (P1-16, P1-5/Q3) — alert noise-control suppression and
  // operator env-key fallback attribution ({provider} tag).
  'alert_noise_suppressed_total',
  'operator_key_fallback_total',
  // Audit plan v2 §5.3 (Q4) — non-blocking per-user daily spend-threshold
  // crossings surfaced on the admin System Health dashboard.
  'admin_spend_threshold_total',
  // Audit 2026-10-18 C-02 — committee executions tagged by asset class so
  // cost/latency are attributable per asset instead of XAUUSD-only.
  'committee_execution_total',
  // Phase 1 (Jev System One) — per-endpoint request health and latency for
  // the `/v1/systemone` decision-model calls ({provider} tag).
  'jev_request_failed_total',
  'jev_request_latency_ms',
  // Phase 1 (Jev) — fast input-guardrail verdicts and runtime availability.
  'guardrail_jev_flagged_total',
  'guardrail_jev_unavailable_total',
  // Phase 2 (Jev) — adaptive committee consensus gate, tagged by decision
  // ({decision}=run|skip, {reason}) and by skipped wave ({wave}=critique|debate).
  'committee_consensus_gate_total',
  'committee_deliberation_skipped_total',
  // Phase 2 (Jev) — RAG/web-search indirect-injection quarantine and rerank.
  'jev_rag_quarantine_total',
  // Phase 2 (Jev) — semantic disclosure verifier verdicts.
  'committee_disclosure_verification_total',
  // Phase 3 (Jev) — market-regime memory writes (JEPA-style recall corpus).
  'market_regime_memory_failed_total',
] as const;

export type MetricName = (typeof METRIC_NAMES)[number];

export function isMetricName(value: string): value is MetricName {
  return (METRIC_NAMES as readonly string[]).includes(value);
}

export interface HistogramSummary {
  count: number;
  sum: number;
  avg: number;
  min: number;
  max: number;
  /** Cumulative bucket counts aligned with `bounds`. */
  buckets: number[];
  /** Upper bounds for `buckets` (ms for latency, USD for `*_usd` cost). */
  bounds: number[];
}

/** Serialized form of the whole registry, safe to log / POST / JSON-stringify. */
export interface MetricsSnapshot {
  counters: Record<string, number>;
  histograms: Record<string, HistogramSummary>;
}

/**
 * Fixed upper bounds (same unit as observed values) for histogram buckets.
 * Observations are counted into every bucket whose bound is >= the value, so
 * bucket `i` is cumulative: `buckets[i]` = observations <= `BUCKET_BOUNDS[i]`.
 * These make `{name}_bucket{le="…"}` series available for p95-style
 * percentiles via `histogram_quantile` in Grafana. These bounds are ms-based
 * and apply to latency metrics (ttft, turn latency, tick freshness);
 * `*_usd` cost metrics use `HISTOGRAM_BUCKET_BOUNDS_USD` via
 * `boundsForMetric`.
 */
export const HISTOGRAM_BUCKET_BOUNDS_MS = [
  1, 5, 10, 25, 50, 100, 250, 500, 1000, 2000, 5000, 10000, 20000, 30000, 60000, 120000,
] as const;

/**
 * Sub-dollar bucket bounds for USD cost histograms (`turn_cost_usd`,
 * `committee_step_cost_usd`). Values are recorded in dollars, so the
 * millisecond bounds above would trap every observation in the `<= 1` bucket
 * and make cost percentiles meaningless.
 */
export const HISTOGRAM_BUCKET_BOUNDS_USD = [
  0.0001, 0.0005, 0.001, 0.0025, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5,
] as const;

/** Pick histogram bucket bounds by metric unit: `*_usd` costs vs ms latency. */
export function boundsForMetric(name: MetricName): readonly number[] {
  return name.endsWith('_usd') ? HISTOGRAM_BUCKET_BOUNDS_USD : HISTOGRAM_BUCKET_BOUNDS_MS;
}

interface HistogramAccumulator {
  count: number;
  sum: number;
  min: number;
  max: number;
  /** Cumulative count of observations <= each bound (aligned with `bounds`). */
  buckets: number[];
  /** The bounds this series was accumulated against (stable per metric). */
  bounds: readonly number[];
}

function keyFor(name: MetricName, tags?: Record<string, string>): string {
  if (!tags || Object.keys(tags).length === 0) return name;
  const sorted = Object.entries(tags)
    .map(([k, v]) => [k, v] as const)
    .sort((a, b) => a[0].localeCompare(b[0]));
  return `${name}{${sorted.map(([k, v]) => `${k}=${v}`).join(',')}}`;
}

/**
 * A simple, monotonic metrics registry. Counter increments and histogram
 * observations are accumulated in memory; `snapshot()` flattens them for
 * export. Instances are independent so tests can construct their own.
 */
export class MetricsRegistry {
  private readonly counters = new Map<string, number>();
  private readonly histograms = new Map<string, HistogramAccumulator>();

  /** Increment a counter (defaults to +1). */
  increment(name: MetricName, opts?: { by?: number; tags?: Record<string, string> }): void {
    const key = keyFor(name, opts?.tags);
    const next = (this.counters.get(key) ?? 0) + (opts?.by ?? 1);
    this.counters.set(key, next);
  }

  /** Record one observation into a histogram. */
  observe(name: MetricName, value: number, opts?: { tags?: Record<string, string> }): void {
    if (!Number.isFinite(value)) return;
    const key = keyFor(name, opts?.tags);
    const bounds = boundsForMetric(name);
    const current = this.histograms.get(key);
    if (!current) {
      const buckets = bounds.map(() => 0);
      for (let i = 0; i < buckets.length; i++) {
        if (value <= bounds[i]!) buckets[i] = 1;
      }
      this.histograms.set(key, {
        count: 1,
        sum: value,
        min: value,
        max: value,
        buckets,
        bounds,
      });
      return;
    }
    current.count += 1;
    current.sum += value;
    if (value < current.min) current.min = value;
    if (value > current.max) current.max = value;
    for (let i = 0; i < current.buckets.length; i++) {
      if (value <= current.bounds[i]!) {
        current.buckets[i] = current.buckets[i]! + 1;
      }
    }
  }

  /** Export a flat, JSON-serializable snapshot of the registry. */
  snapshot(): MetricsSnapshot {
    const counters: Record<string, number> = {};
    for (const [key, value] of this.counters) counters[key] = value;

    const histograms: Record<string, HistogramSummary> = {};
    for (const [key, acc] of this.histograms) {
      histograms[key] = {
        count: acc.count,
        sum: acc.sum,
        avg: acc.count > 0 ? acc.sum / acc.count : 0,
        min: acc.min,
        max: acc.max,
        // Copy so callers cannot mutate the live accumulator through the snapshot.
        buckets: [...acc.buckets],
        bounds: [...acc.bounds],
      };
    }

    return { counters, histograms };
  }

  /** Reset all counters and histograms (used between test cases / reports). */
  reset(): void {
    this.counters.clear();
    this.histograms.clear();
  }
}

/** Process-wide default registry for app code that doesn't need DI. */
export const metrics = new MetricsRegistry();
