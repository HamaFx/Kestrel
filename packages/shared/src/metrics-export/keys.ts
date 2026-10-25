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

// Registry-key parsing shared by the OTLP and Prometheus transports.

/**
 * Split a registry key (`name` or `name{k=v,k2=v2}`) into the metric name and
 * its tag labels so tagged series export with proper Prometheus/OTLP labels
 * instead of a literal `{…}` inside the metric name.
 */
export function parseSnapshotKey(key: string): {
  name: string;
  labels: Array<[string, string]>;
} {
  const brace = key.indexOf('{');
  if (brace === -1) return { name: key, labels: [] };
  const name = key.slice(0, brace);
  const inner = key.slice(brace + 1, key.lastIndexOf('}'));
  const labels: Array<[string, string]> = [];
  for (const part of inner.split(',')) {
    const eq = part.indexOf('=');
    if (eq <= 0) continue;
    labels.push([part.slice(0, eq), part.slice(eq + 1)]);
  }
  return { name, labels };
}
