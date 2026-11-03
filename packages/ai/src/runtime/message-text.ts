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

import { getMessageText } from '@kestrel/shared';
import { createCategorizedLogger } from '@kestrel/shared/logger';
import type { UIMessage } from 'ai';

import { hashLogValue } from '../diagnostics/redact';

const mlog = createCategorizedLogger('ai', { component: 'message-text' });

/**
 * Upper bound on the user text handed to routing and model callers. Matches
 * the chat boundary's per-message limit, so accepted messages are never
 * silently shortened here.
 */
const MAX_USER_TEXT_CHARS = 50_000;

/**
 * Patterns that indicate a prompt injection attempt.
 * Matched case-insensitively against the user's raw message text.
 *
 * These cover common jailbreak / instruction-override patterns without
 * tripping on legitimate trading queries (e.g. "should I ignore the
 * previous support level?" is fine — the patterns are anchored to
 * the injection phrases, not partial word matches).
 */
const INJECTION_PATTERNS: ReadonlyArray<{ rx: RegExp; label: string }> = [
  // Classic "ignore all instructions" jailbreaks. Allows stacked
  // modifiers like "ignore all previous instructions" or "ignore the above
  // instructions". Narrowed to require "instructions" specifically.
  {
    rx: /ignore\s+(the\s+)?(all\s+)?(previous\s+)?(above\s+)?instructions\b/i,
    label: 'ignore-instructions',
  },
  // "You are now a/an [adjective] AI" — role override attacks.
  // Pattern A: "you are no longer [a/an] AI/assistant" (no adjective needed).
  {
    rx: /you\s+(are|have become|are now)\s+no\s+longer\s+(an?\s+)?(ai|assistant|model|bot|system)\b/i,
    label: 'role-override',
  },
  // Pattern B: "you are [a/an] ADJECTIVE AI/assistant" (adjective required
  // to avoid false-positives on "you are an AI assistant").
  {
    rx: /you\s+(are|have become|are now)\s+(an?\s+)?(different|another|unrestricted|uncensored|evil|malicious)\s+(ai|assistant|model|bot|system)\b/i,
    label: 'role-override',
  },
  // DAN mode jailbreaks — only match the specific "DAN mode" phrase.
  // Dropped the loose is/can/will patterns that false-positive on "Dan is".
  { rx: /DAN\s+mode\b/i, label: 'dan-jailbreak' },
  // Impersonating a system message.
  {
    rx: /^(system|developer|admin)\s*:\s*(forget|ignore|override|you\s+(are|must|should|will))/im,
    label: 'system-impersonation',
  },
  // "Forget everything you know" — complete reset attacks. Narrowed
  // to the specific jailbreak phrase to avoid matching legitimate
  // requests like "forget about the last trade" or "forget prior analysis".
  { rx: /forget\s+(everything|all)\s+you\s+know\b/i, label: 'forget-attack' },
  // Base64-encoded injection payloads (detect the wrapper pattern).
  {
    rx: /(decode|eval|parse|execute)\s+(this|the\s+following)\s+(base64|encoded|payload)/i,
    label: 'encoded-payload',
  },
];

/**
 * Detect prompt injection attempts in user input.
 *
 * Detection only: the text is returned untouched. The model-facing injection
 * boundary is owned by `PromptInjectionDetector` and the tool-output
 * quarantine, so prepending a legacy note here would only add a second,
 * conflicting instruction to the prompt.
 *
 * The audit log records pattern labels, length, and a stable hash — never the
 * raw payload.
 */
function detectPromptInjection(raw: string): {
  flagged: boolean;
  patterns: string[];
} {
  if (!raw || raw.trim().length === 0) return { flagged: false, patterns: [] };

  const patterns: string[] = [];
  for (const { rx, label } of INJECTION_PATTERNS) {
    if (rx.test(raw)) {
      patterns.push(label);
    }
  }

  if (patterns.length === 0) return { flagged: false, patterns };

  mlog.warn('prompt injection detected', {
    patterns,
    textLen: raw.length,
    payloadHash: hashLogValue(raw),
  });

  return { flagged: true, patterns };
}

/**
 * Extract the user-visible text for routing and model callers. Delegates to
 * the single shared UIMessage extractor and bounds the result.
 *
 * Detection runs for the audit trail, but the text is returned untouched:
 * the model-facing injection boundary is owned by `PromptInjectionDetector`
 * and tool-output quarantine, so a legacy note prefix would only compete
 * with them.
 */
export function extractUserMessageText(message: UIMessage): string {
  const text = getMessageText(message);
  if (text.length > 0) detectPromptInjection(text);
  return text.slice(0, MAX_USER_TEXT_CHARS);
}
