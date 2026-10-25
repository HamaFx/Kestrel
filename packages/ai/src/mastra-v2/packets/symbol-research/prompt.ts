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

// Read-only prompt guards for the generalized symbol-research path.

import { extractSymbolsFromText, SymbolSchema } from '@kestrel/shared';

import { INJECTION_TERMS, isHighConfidenceMutationIntent } from '@ai/routing/keywords';

/** Extract one canonical symbol from a prompt, using the fallback only when no symbol is named. */
export function extractSymbolFromPrompt(prompt: string, fallback?: string): string | null {
  const matched = extractSymbolsFromText(prompt);
  if (matched.length > 1) return null;
  if (matched.length === 1) return matched[0] ?? null;
  if (fallback === undefined) return null;
  const parsed = SymbolSchema.safeParse(fallback);
  return parsed.success ? parsed.data : null;
}

/** Conservative server-side guard for the read-only generalized mode path. */
export function isSafeSymbolResearchPrompt(prompt: string): boolean {
  const trimmed = prompt.trim();
  if (!trimmed) return false;
  if (INJECTION_TERMS.test(trimmed)) return false;
  if (isHighConfidenceMutationIntent(trimmed)) return false;
  return true;
}
