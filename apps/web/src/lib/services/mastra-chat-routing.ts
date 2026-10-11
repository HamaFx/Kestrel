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

import 'server-only';

// P0-3 (audit plan §1.1): every routing regex and classifier now lives in
// `packages/ai/src/routing-keywords.ts` + `packages/ai/src/mastra/router.ts`.
// This module is kept as a thin deprecated re-export so existing web call
// sites keep working while they migrate to `routeUnified`.
import {
  isHighConfidenceMutationIntent,
  isInjectionAttempt as unifiedIsInjectionAttempt,
  isMastraSymbolCandidate as unifiedIsMastraSymbolCandidate,
  isMastraXauusdCandidate as unifiedIsMastraXauusdCandidate,
  isMastraXauusdFollowupCandidate as unifiedIsMastraXauusdFollowupCandidate,
  extractMastraSymbol as unifiedExtractMastraSymbol,
  mastraXauusdChatKind as unifiedMastraXauusdChatKind,
} from '@kestrel/ai/mastra';

/**
 * @deprecated Use `routeUnified` from `@kestrel/ai/mastra` — the unified
 * router classifies injection, mutation, symbol, and route in one pass.
 */
export const isMutationIntent: (prompt: string) => boolean =
  isHighConfidenceMutationIntent;

/** @deprecated Use `routeUnified` from `@kestrel/ai/mastra`. */
export const isInjectionAttempt: (prompt: string) => boolean = unifiedIsInjectionAttempt;

/** @deprecated Use `routeUnified` from `@kestrel/ai/mastra`. */
export const extractMastraSymbol: (prompt: string) => string | null = unifiedExtractMastraSymbol;

/** @deprecated Use `routeUnified` from `@kestrel/ai/mastra`. */
export const isMastraSymbolCandidate: (prompt: string) => boolean =
  unifiedIsMastraSymbolCandidate;

/** @deprecated Use `routeUnified` from `@kestrel/ai/mastra`. */
export const isMastraXauusdCandidate: (prompt: string) => boolean =
  unifiedIsMastraXauusdCandidate;

/** @deprecated Use `routeUnified` from `@kestrel/ai/mastra`. */
export const isMastraXauusdFollowupCandidate: (prompt: string) => boolean =
  unifiedIsMastraXauusdFollowupCandidate;

/** @deprecated Use `routeUnified` from `@kestrel/ai/mastra`. */
export const mastraXauusdChatKind: (
  prompt: string,
  hasCurrentReport?: boolean,
) => 'research' | 'conversation' = unifiedMastraXauusdChatKind;

/** @deprecated Canonical chat eligibility now derives from the unified router. */
export function isMastraCanonicalCandidate(prompt: string, hasCurrentReport = false): boolean {
  if (isInjectionAttempt(prompt)) return false;
  if (isHighConfidenceMutationIntent(prompt)) return false;
  if (extractMastraSymbol(prompt) !== null) return false;
  if (hasCurrentReport && isMastraXauusdFollowupCandidate(prompt)) return false;
  return true;
}
