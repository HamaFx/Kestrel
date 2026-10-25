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
 * Dependency-free OTLP/HTTP metrics exporter.
 *
 * Pushes a `MetricsSnapshot` to a Grafana Cloud (or any OTLP-HTTP) endpoint
 * using a single `fetch` POST. There is intentionally no OpenTelemetry SDK
 * dependency here — the in-process registry in `metrics.ts` is already
 * vendor-neutral, and a raw OTLP JSON POST is enough to satisfy Grafana Cloud
 * metrics ingestion.
 *
 * Fail-closed by design (matching `initLangfuse`): when the Grafana env vars
 * are absent, or the POST fails, nothing is thrown to the caller. The app runs
 * exactly as before; metrics simply stay in-process.
 *
 * Split by domain group: transport config in `./metrics-export/config`, key
 * parsing in `./metrics-export/keys`, the OTLP JSON transport in
 * `./metrics-export/otlp`, the Prometheus remote-write transport in
 * `./metrics-export/remote-write`, and the fail-closed entry in
 * `./metrics-export/flush`. This file keeps every name the
 * `@kestrel/shared/metrics-export` subpath used to export.
 */

export {
  GRAFANA_OTLP_API_KEY_ENV,
  GRAFANA_OTLP_ENDPOINT_ENV,
  GRAFANA_RW_ENDPOINT_ENV,
  GRAFANA_RW_INSTANCE_ID_ENV,
  buildMetricsUrl,
  grafanaOtlpConfigFromEnv,
  grafanaRemoteWriteConfigFromEnv,
  type GrafanaOtlpConfig,
  type GrafanaRemoteWriteConfig,
} from './metrics-export/config';
export { parseSnapshotKey } from './metrics-export/keys';
export { exportMetricsToOtlp, snapshotToOtlpJson } from './metrics-export/otlp';
export {
  exportMetricsToRemoteWrite,
  snapshotToPromRemoteWrite,
} from './metrics-export/remote-write';
export { flushMetrics } from './metrics-export/flush';
