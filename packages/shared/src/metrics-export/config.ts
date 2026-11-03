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

// Transport config for the OTLP metrics exporter.

/** Env var names (single source of truth for docs + callers). */
export const GRAFANA_OTLP_ENDPOINT_ENV = 'GRAFANA_CLOUD_OTLP_ENDPOINT' as const;
export const GRAFANA_OTLP_API_KEY_ENV = 'GRAFANA_CLOUD_API_KEY' as const;

export interface GrafanaOtlpConfig {
  /** Full OTLP base URL, e.g. `https://otlp-gateway-…-…-….grafana.net/otlp`. */
  endpoint: string;
  /** Grafana Cloud token with `metrics:write` scope. */
  apiKey: string;
  /** OTLP resource `service.name` label. Defaults to `kestrel`. */
  serviceName?: string;
}

/**
 * Read Grafana Cloud OTLP config from the environment. Returns `null` when
 * either value is missing so callers can skip the push entirely.
 */
export function grafanaOtlpConfigFromEnv(
  env: Readonly<Record<string, string | undefined>> = process.env,
): GrafanaOtlpConfig | null {
  const endpoint = (env[GRAFANA_OTLP_ENDPOINT_ENV] ?? '').trim();
  const apiKey = (env[GRAFANA_OTLP_API_KEY_ENV] ?? '').trim();
  if (!endpoint || !apiKey) return null;
  return { endpoint, apiKey };
}

/** Append the metrics path unless the endpoint already targets it. */
export function buildMetricsUrl(endpoint: string): string {
  const base = endpoint.replace(/\/+$/, '');
  if (base.endsWith('/v1/metrics')) return base;
  return `${base}/v1/metrics`;
}
