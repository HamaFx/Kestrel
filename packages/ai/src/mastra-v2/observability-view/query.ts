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

// SPDX-License-Identifier: Apache-2.0

// Pure query helpers behind the unified Mastra run view (DEC-05 split of
// observability-view.ts): which workflow holds a telemetry row's run state,
// and which provider produced a model id.

/** Known workflow ids whose snapshots back Mastra runs (from the registry). */
export const MASTRA_WORKFLOW_IDS = ['symbol-research', 'full-analysis', 'xauusd-report'] as const;

/** Map a telemetry kind to the workflow id that would hold its run state. */
export function workflowIdForKind(kind: string | null): string | null {
  if (!kind) return null;
  if (kind.startsWith('mastra_full_job')) return 'full-analysis';
  if (kind.startsWith('mastra_mode')) return 'symbol-research';
  if (kind.startsWith('mastra_xauusd')) return 'xauusd-report';
  if (kind.startsWith('mastra_canonical_chat')) return null;
  return null;
}

/** Derive the provider from a model id (`google/…`, `openai/…`, …). */
export function providerFromModel(model: string): string {
  const slash = model.indexOf('/');
  if (slash > 0) return model.slice(0, slash);
  const at = model.indexOf(':');
  if (at > 0) return model.slice(0, at);
  return 'unknown';
}
