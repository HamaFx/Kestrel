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
 * Audit R15 — deterministic indirect-snippet screening.
 *
 * RAG chunks, web-search snippets, and recalled memory are untrusted external
 * data. Every candidate item is checked with `quarantineExternalText`, which
 * recognizes instruction-like phrasing with no network call, and instruction
 * like items are withheld before they can reach the model.
 *
 * The screen runs on every item regardless of posture and never fails open:
 * a missing network detector can no longer mean an unscreened instruction
 * reaches the model, because the deterministic floor is the whole screen.
 */

import {
  appendContentScreenEvents,
  EXTERNAL_QUARANTINE_NOTICE,
  quarantineExternalText,
  type ContentScreenMode,
  type ContentScreenPath,
  type ContentScreenReportSink,
} from './external-content';

/** Minimum shape the screening pipeline needs from a candidate row. */
export interface SnippetScreenItem {
  id: string;
  text: string;
}

export interface SnippetScreenArgs<T extends SnippetScreenItem> {
  items: readonly T[];
  /**
   * Screening posture, kept for the run report (`strict` on research paths,
   * `availability` on conversation paths). The deterministic screen applies
   * in both postures.
   */
  mode: ContentScreenMode;
  /** Run context that receives the screening event. */
  reportSink?: ContentScreenReportSink | null | undefined;
  /** Run-report path tag. Defaults to `rag`. */
  reportPath?: ContentScreenPath | undefined;
}

export interface SnippetScreenResult<T extends SnippetScreenItem> {
  /** Items whose text carried no recognizable instruction, in caller order. */
  kept: T[];
  /** Ids withheld as instruction-like (never returned to the caller). */
  quarantinedIds: string[];
  /** Always empty: the deterministic screen covers every item. */
  withheldIds: string[];
  /** Always empty: no item is passed without the screen. */
  unscreenedIds: string[];
  /** Always false: the deterministic screen cannot be unavailable. */
  failedClosed: boolean;
}

/**
 * Withhold every item whose text carries recognizable instruction-like
 * phrasing. Never throws and reports the outcome to the run context.
 */
export function screenSnippets<T extends SnippetScreenItem>(
  args: SnippetScreenArgs<T>,
): SnippetScreenResult<T> {
  const quarantinedIds: string[] = [];
  const kept: T[] = [];
  for (const item of args.items) {
    // Provider normalization may already have replaced an instruction-like
    // field with the quarantine notice; the whole item is then withheld so the
    // model never receives a low-value placeholder instead of evidence.
    if (
      item.text.includes(EXTERNAL_QUARANTINE_NOTICE) ||
      quarantineExternalText(item.text).quarantined
    ) {
      quarantinedIds.push(item.id);
    } else {
      kept.push(item);
    }
  }
  if (args.items.length > 0) {
    appendContentScreenEvents(args.reportSink ?? null, [
      {
        path: args.reportPath ?? 'rag',
        mode: args.mode,
        screened: args.items.length,
        quarantined: quarantinedIds.length,
        withheld: quarantinedIds.length,
        unscreened: 0,
        detectorUnavailable: false,
        failedClosed: false,
      },
    ]);
  }
  return {
    kept,
    quarantinedIds,
    withheldIds: [],
    unscreenedIds: [],
    failedClosed: false,
  };
}
