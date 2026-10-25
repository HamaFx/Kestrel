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

// Fail-closed flush of the process-wide registry over every configured transport.

import { metrics } from '../metrics';
import { grafanaOtlpConfigFromEnv, grafanaRemoteWriteConfigFromEnv } from './config';
import { exportMetricsToOtlp } from './otlp';
import { exportMetricsToRemoteWrite } from './remote-write';

/**
 * Push the process-wide registry to Grafana Cloud over every configured
 * transport (OTLP JSON + Prometheus remote write). Never throws and no-ops
 * when no credentials are present — safe to call at stream end, on a timer,
 * or in a shutdown hook.
 */
export async function flushMetrics(
  env: Readonly<Record<string, string | undefined>> = process.env,
  fetchFn: typeof fetch = fetch,
): Promise<void> {
  const otlp = grafanaOtlpConfigFromEnv(env);
  const remoteWrite = grafanaRemoteWriteConfigFromEnv(env);
  if (!otlp && !remoteWrite) return;
  const snapshot = metrics.snapshot();
  if (otlp) {
    try {
      await exportMetricsToOtlp(snapshot, otlp, fetchFn);
    } catch {
      // Fail-closed: an observability outage must never fail the request —
      // but count it so the flush-failure SLI can surface the outage.
      metrics.increment('metrics_flush_failed_total');
    }
  }
  if (remoteWrite) {
    try {
      await exportMetricsToRemoteWrite(snapshot, remoteWrite, fetchFn);
    } catch {
      metrics.increment('metrics_flush_failed_total');
    }
  }
}
