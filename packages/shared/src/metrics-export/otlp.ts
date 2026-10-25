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

// OTLP/HTTP JSON transport: snapshot → `ExportMetricsServiceRequest` → POST.

import { HISTOGRAM_BUCKET_BOUNDS_MS, type MetricsSnapshot } from '../metrics';
import { buildMetricsUrl, type GrafanaOtlpConfig } from './config';
import { parseSnapshotKey } from './keys';

/** OTLP aggregation-temporality enum value for cumulative metrics. */
const AGGREGATION_TEMPORALITY_CUMULATIVE = 2;

interface OtlpKeyValue {
  key: string;
  value: { stringValue: string };
}

interface OtlpNumberDataPoint {
  timeUnixNano: string;
  asInt?: string;
  asDouble?: number;
  attributes?: OtlpKeyValue[];
}

function intPoint(
  value: number,
  nowNs: string,
  labels: Array<[string, string]> = [],
): OtlpNumberDataPoint {
  return {
    asInt: String(Math.round(value)),
    timeUnixNano: nowNs,
    attributes: labels.map(([k, v]) => ({ key: k, value: { stringValue: v } })),
  };
}

function doublePoint(
  value: number,
  nowNs: string,
  labels: Array<[string, string]> = [],
): OtlpNumberDataPoint {
  return {
    asDouble: value,
    timeUnixNano: nowNs,
    attributes: labels.map(([k, v]) => ({ key: k, value: { stringValue: v } })),
  };
}

/** Convert the in-process snapshot into an OTLP `ExportMetricsServiceRequest`. */
export function snapshotToOtlpJson(
  snapshot: MetricsSnapshot,
  serviceName: string,
  nowNs: string,
): unknown {
  const metricsOut: unknown[] = [];

  for (const [key, value] of Object.entries(snapshot.counters)) {
    const { name, labels } = parseSnapshotKey(key);
    metricsOut.push({
      name,
      sum: {
        dataPoints: [intPoint(value, nowNs, labels)],
        aggregationTemporality: AGGREGATION_TEMPORALITY_CUMULATIVE,
        isMonotonic: true,
      },
    });
  }

  // Histograms are emitted as a proper OTLP histogram (so Grafana derives
  // `{name}_bucket/_count/_sum` series usable with `histogram_quantile`),
  // plus avg/min/max gauges so the central-tendency fields stay queryable.
  for (const [key, summary] of Object.entries(snapshot.histograms)) {
    const { name, labels } = parseSnapshotKey(key);
    metricsOut.push({
      name,
      histogram: {
        dataPoints: [
          {
            timeUnixNano: nowNs,
            count: String(summary.count),
            sum: summary.sum,
            bucketCounts: summary.buckets.map((v) => String(v)),
            explicitBounds: [...HISTOGRAM_BUCKET_BOUNDS_MS],
            attributes: labels.map(([k, v]) => ({ key: k, value: { stringValue: v } })),
          },
        ],
        aggregationTemporality: AGGREGATION_TEMPORALITY_CUMULATIVE,
      },
    });
    const avg: Array<{ name: string; gauge: { dataPoints: OtlpNumberDataPoint[] } }> = [
      { name: `${name}_avg`, gauge: { dataPoints: [doublePoint(summary.avg, nowNs, labels)] } },
      { name: `${name}_min`, gauge: { dataPoints: [doublePoint(summary.min, nowNs, labels)] } },
      { name: `${name}_max`, gauge: { dataPoints: [doublePoint(summary.max, nowNs, labels)] } },
    ];
    metricsOut.push(...avg);
  }

  const resourceAttributes: OtlpKeyValue[] = [
    { key: 'service.name', value: { stringValue: serviceName } },
  ];

  return {
    resourceMetrics: [
      {
        resource: { attributes: resourceAttributes },
        scopeMetrics: [
          {
            scope: { name: 'kestrel' },
            metrics: metricsOut,
          },
        ],
      },
    ],
  };
}

/**
 * POST one snapshot to the configured OTLP endpoint. Throws on transport or
 * non-2xx errors so the fail-closed `flushMetrics` wrapper can swallow them.
 */
export async function exportMetricsToOtlp(
  snapshot: MetricsSnapshot,
  config: GrafanaOtlpConfig,
  fetchFn: typeof fetch = fetch,
  nowNs: string = String(BigInt(Date.now()) * 1_000_000n),
): Promise<void> {
  const url = buildMetricsUrl(config.endpoint);
  const body = JSON.stringify(snapshotToOtlpJson(snapshot, config.serviceName ?? 'kestrel', nowNs));
  const response = await fetchFn(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${config.apiKey}`,
    },
    body,
  });
  if (!response.ok) {
    throw new Error(`OTLP metrics push failed: HTTP ${response.status}`);
  }
}
