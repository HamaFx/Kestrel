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

/**
 * Audit R15 — how the snippet-screening pipeline reports itself.
 *
 * A run must be able to tell what was quarantined, what was withheld because
 * the strict posture could not screen it, and what passed with the
 * deterministic layer only. Every outcome of `./rag-quarantine` therefore
 * lands in two places at once:
 *
 *   - the run's content-screen report (Mastra `RequestContext`), and
 *   - the typed metrics registry, tagged by posture and path.
 *
 * Keeping the bookkeeping here means the orchestrator reads as policy, not as
 * metric plumbing.
 */

import { metrics } from '@kestrel/shared';

import {
  appendContentScreenEvents,
  type ContentScreenMode,
  type ContentScreenPath,
  type ContentScreenReportSink,
} from '../mastra-v2/packets/external-content';

/** Why the model-backed screen did not run. */
export type QuarantineDegradeReason = 'unconfigured' | 'unavailable';

export interface SnippetScreenEventInput {
  mode: ContentScreenMode;
  path: ContentScreenPath;
  /** Items inspected (the whole candidate set, not just the model batch). */
  screened: number;
  /** Items withheld as instruction-like. */
  quarantined: number;
  /** Items withheld for any other reason (cap, strict refusal). */
  withheld: number;
  /** Items passed with the deterministic screen only. */
  unscreened: number;
  /** True when the model-backed screen was unconfigured or unreachable. */
  detectorUnavailable: boolean;
  /** True when the strict posture refused to pass unscreened content through. */
  failedClosed: boolean;
  /** Provider that answered the batch, when one did. */
  provider?: string | undefined;
}

/**
 * Publish one screening outcome to the run report and the metrics registry.
 * The provider stays a metric tag (it is provenance, not screening state).
 */
export function reportSnippetScreenEvent(
  sink: ContentScreenReportSink | null | undefined,
  input: SnippetScreenEventInput,
): void {
  const { mode, path, provider, ...counters } = input;
  appendContentScreenEvents(sink, [{ ...counters, path, mode }]);

  const tags: Record<string, string> = {
    mode,
    path,
    ...(provider ? { provider } : {}),
  };
  if (input.quarantined > 0) {
    metrics.increment('jev_rag_quarantine_total', {
      tags: { ...tags, quarantined: String(input.quarantined) },
    });
  }
  if (input.unscreened > 0) {
    metrics.increment('jev_rag_unscreened_total', {
      tags: { ...tags, unscreened: String(input.unscreened) },
    });
  }
  if (input.withheld > 0) {
    metrics.increment('jev_rag_withheld_total', {
      tags: { ...tags, withheld: String(input.withheld) },
    });
  }
  if (input.failedClosed) {
    metrics.increment('jev_rag_failed_closed_total', { tags });
  }
}

/** Record that the model screen did not run, and why. */
export function reportSnippetScreenDegraded(
  mode: ContentScreenMode,
  reason: QuarantineDegradeReason,
): void {
  metrics.increment('jev_rag_quarantine_degraded_total', { tags: { mode, reason } });
}
