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

/* Prometheus remote-write transport (protobuf + snappy)                      */
/*                                                                             */
/* Some Grafana Cloud stacks cannot map OTLP-gateway auth to the tenant (the  */
/* "legacy auth cannot be upgraded because the host is not found" platform   */
/* bug). The hosted-Metrics remote-write door (`/api/prom/push`) always       */
/* accepts the same `metrics:write` Cloud API key via Basic auth, so this     */
/* transport is the dependable path for those stacks.                         */

import { compress as snappyCompress } from 'snappyjs';

import { HISTOGRAM_BUCKET_BOUNDS_MS, type MetricsSnapshot } from '../metrics';
import type { GrafanaRemoteWriteConfig } from './config';
import { parseSnapshotKey } from './keys';

/* Protobuf helpers — the remote-write wire format is tiny, so the encoder is
 * hand-rolled instead of pulling in a protobuf runtime. */

function protoVarint(value: number, out: number[]): void {
  let v = value >>> 0;
  while (v >= 0x80) {
    out.push((v & 0x7f) | 0x80);
    v >>>= 7;
  }
  out.push(v);
}

function protoVarint64(value: number, out: number[]): void {
  // ms-since-epoch timestamps overflow 32-bit math, so encode via BigInt.
  let v = BigInt(Math.trunc(value));
  while (v >= 0x80n) {
    out.push(Number(v & 0x7fn) | 0x80);
    v >>= 7n;
  }
  out.push(Number(v));
}

function protoBytes(tag: number, data: Uint8Array, out: number[]): void {
  protoVarint((tag << 3) | 2, out);
  protoVarint(data.length, out);
  for (let i = 0; i < data.length; i++) out.push(data[i]!);
}

function protoDouble(tag: number, value: number, out: number[]): void {
  protoVarint((tag << 3) | 1, out);
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, value, true);
  for (let i = 0; i < 8; i++) out.push(view.getUint8(i));
}

const ASCII = new TextEncoder();

function encodeLabel(name: string, value: string, out: number[]): void {
  protoBytes(1, ASCII.encode(name), out);
  protoBytes(2, ASCII.encode(value), out);
}

function encodeSample(value: number, timestampMs: number, out: number[]): void {
  protoDouble(1, value, out); // Sample.value (double, wire type 1)
  protoVarint(2 << 3, out); // Sample.timestamp tag
  protoVarint64(timestampMs, out);
}

/**
 * Convert a snapshot into a snappy-compressed Prometheus remote-write
 * request body from `prometheus.WriteRequest` (timeseries → labels/samples).
 * Counters keep their cumulative value; histogram fields are emitted as
 * `{name}_count/_sum/_avg/_min/_max` gauges (matching the OTLP transport so
 * dashboards can query either backend with the same metric names). Returns an
 * empty buffer when the snapshot has nothing to report.
 */
export function snapshotToPromRemoteWrite(
  snapshot: MetricsSnapshot,
  job: string,
  timestampMs: number = Date.now(),
): Buffer {
  /** Metrics to emit, each with its cumulative sample value(s). */
  const pending: Array<{
    name: string;
    labels?: Array<[string, string]>;
    samples: Array<{ value: number; timestampMs: number }>;
  }> = [];

  for (const [key, value] of Object.entries(snapshot.counters)) {
    const { name, labels } = parseSnapshotKey(key);
    pending.push({ name, labels, samples: [{ value, timestampMs }] });
  }
  for (const [key, summary] of Object.entries(snapshot.histograms)) {
    const { name, labels } = parseSnapshotKey(key);
    // Prometheus-convention cumulative buckets so `histogram_quantile` works
    // in Grafana: `{name}_bucket{le=…}` labels plus `{le="+Inf"}` = total.
    HISTOGRAM_BUCKET_BOUNDS_MS.forEach((bound, i) => {
      pending.push({
        name: `${name}_bucket`,
        labels: [...labels, ['le', String(bound)]],
        samples: [{ value: summary.buckets[i] ?? 0, timestampMs }],
      });
    });
    pending.push({
      name: `${name}_bucket`,
      labels: [...labels, ['le', '+Inf']],
      samples: [{ value: summary.count, timestampMs }],
    });
    pending.push(
      { name: `${name}_count`, labels, samples: [{ value: summary.count, timestampMs }] },
      { name: `${name}_sum`, labels, samples: [{ value: summary.sum, timestampMs }] },
      { name: `${name}_avg`, labels, samples: [{ value: summary.avg, timestampMs }] },
      { name: `${name}_min`, labels, samples: [{ value: summary.min, timestampMs }] },
      { name: `${name}_max`, labels, samples: [{ value: summary.max, timestampMs }] },
    );
  }

  if (pending.length === 0) return Buffer.alloc(0);

  const request: number[] = [];
  for (const metric of pending) {
    const ts: number[] = [];
    // Each label pair is its own WriteMessage, wrapped in TimeSeries field 1.
    const labels: Array<[string, string]> = [
      ['__name__', metric.name],
      ['job', job ?? 'kestrel'],
      ...(metric.labels ?? []),
    ];
    for (const [name, value] of labels) {
      const labelMsg: number[] = [];
      encodeLabel(name, value, labelMsg);
      protoBytes(1, Uint8Array.from(labelMsg), ts);
    }
    for (const sample of metric.samples) {
      const sampleMsg: number[] = [];
      encodeSample(sample.value, sample.timestampMs, sampleMsg);
      protoBytes(2, Uint8Array.from(sampleMsg), ts);
    }
    protoBytes(1, Uint8Array.from(ts), request);
  }
  return snappyCompress(Uint8Array.from(request));
}

/**
 * POST one snapshot to the metrics remote-write endpoint. Throws on
 * transport or non-2xx errors so the fail-closed `flushMetrics` can swallow.
 */
export async function exportMetricsToRemoteWrite(
  snapshot: MetricsSnapshot,
  config: GrafanaRemoteWriteConfig,
  fetchFn: typeof fetch = fetch,
  timestampMs: number = Date.now(),
): Promise<void> {
  const body = snapshotToPromRemoteWrite(snapshot, config.job ?? 'kestrel', timestampMs);
  if (body.length === 0) return; // nothing to report
  const url = config.endpoint.replace(/\/+$/, '');
  const basic = Buffer.from(`${config.instanceId}:${config.apiKey}`).toString('base64');
  const response = await fetchFn(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-protobuf',
      'content-encoding': 'snappy',
      'user-agent': 'kestrel-metrics-exporter',
      authorization: `Basic ${basic}`,
    },
    body: body as BodyInit,
  });
  if (!response.ok) {
    throw new Error(`Prometheus remote-write push failed: HTTP ${response.status}`);
  }
}
