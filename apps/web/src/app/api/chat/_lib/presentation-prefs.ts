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

// Presentation preferences enter the AI request boundary only after
// sanitisation: never raw user text.

import { PresentationPreferencesSchema } from '@/lib/services/api-boundary';

export interface PresentationPrefs {
  customInstructions?: string;
  responseStyle: 'default' | 'concise' | 'technical' | 'risk-first';
  citeSources: boolean;
}

/** Only allow presentation preferences into the AI request boundary. */
export function sanitizeCustomInstructions(value: string): string | undefined {
  const controlCharacters = new RegExp(
    `[${String.fromCharCode(0)}-${String.fromCharCode(31)}${String.fromCharCode(127)}]`,
    'g',
  );
  const normalized = value
    .replace(controlCharacters, ' ')
    .replace(/[<>]/g, '')
    .trim()
    .slice(0, 2_000);
  if (!normalized) return undefined;
  if (
    /\b(?:ignore|system|developer|tool|function|execute|mutation|safety|policy|reveal|secret|memory|permission|instruction|jailbreak|override)\b/i.test(
      normalized,
    )
  ) {
    return undefined;
  }
  return normalized;
}

/**
 * Parse the optional `X-AI-Prefs` header. Malformed preferences never
 * invalidate the chat request.
 */
export function readPresentationPrefs(aiPrefsHeader: string | null): PresentationPrefs {
  let customInstructions: string | undefined;
  let responseStyle: 'default' | 'concise' | 'technical' | 'risk-first' = 'default';
  let citeSources = false;
  if (aiPrefsHeader) {
    try {
      const parsedPrefs = PresentationPreferencesSchema.safeParse(JSON.parse(aiPrefsHeader));
      if (parsedPrefs.success) {
        if (typeof parsedPrefs.data.customInstructions === 'string') {
          customInstructions = sanitizeCustomInstructions(parsedPrefs.data.customInstructions);
        }
        responseStyle = parsedPrefs.data.responseStyle ?? 'default';
        citeSources = parsedPrefs.data.citeSources ?? false;
      }
    } catch {
      // Malformed optional preferences do not invalidate the chat request.
    }
  }
  return { ...(customInstructions ? { customInstructions } : {}), responseStyle, citeSources };
}
