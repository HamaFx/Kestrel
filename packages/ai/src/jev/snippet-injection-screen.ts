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
 * Audit R15 — layer 1 of indirect snippet screening: the deterministic floor.
 *
 * `quarantineExternalText` recognizes instruction-like phrases with no network
 * call, so it runs over EVERY candidate item — not just the ones that fit in
 * the model batch — and it runs whether or not a detector is configured. A
 * missing detector can therefore never mean an unscreened instruction reaches
 * the model through a snippet the regex plainly recognizes.
 *
 * Layer 2 (the Jev model batch) lives in `./snippet-injection-batch`; the
 * orchestrator that applies both is `./rag-quarantine`.
 */

import { quarantineExternalText } from '../mastra-v2/packets/external-content';

/** Minimum shape the screening pipeline needs from a candidate row. */
export interface QuarantineRerankItem {
  id: string;
  text: string;
}

export interface DeterministicSnippetScreenResult<T extends QuarantineRerankItem> {
  /** Items whose text carried no recognizable instruction. */
  survivors: T[];
  /** Ids withheld as instruction-like (never returned to the caller). */
  quarantinedIds: string[];
}

/** Drop every item whose text carries recognizable instruction-like phrasing. */
export function screenSnippetsDeterministically<T extends QuarantineRerankItem>(
  items: readonly T[],
): DeterministicSnippetScreenResult<T> {
  const quarantinedIds: string[] = [];
  const survivors: T[] = [];
  for (const item of items) {
    if (quarantineExternalText(item.text).quarantined) {
      quarantinedIds.push(item.id);
    } else {
      survivors.push(item);
    }
  }
  return { survivors, quarantinedIds };
}
