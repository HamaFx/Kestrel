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

// @vitest-environment node

import { describe, expect, it } from 'vitest';

import { AI_EVAL_PROMPTS } from '@/lib/ai-eval-prompts';

// Mirrors the deterministic route gate in mastra-chat-routing.ts so the eval
// set is guaranteed to exercise the Mastra agent rather than silently falling
// back to legacy.
const XAUUSD_TERMS = /\b(?:xauusd|xau\/usd|gold)\b/i;
const OTHER_SYMBOL_TERMS =
  /\b(?:btc|bitcoin|eth|ethereum|eurusd|eur\/usd|gbpusd|gbp\/usd|usdjpy|usd\/jpy|silver|oil|nasdaq|spx|s&p\s*500)\b/i;
const MUTATING_TERMS =
  /\b(?:buy|sell|enter|exit|execute|place|open|close|trade|position|portfolio|journal|alert|notify|schedule|automate)\b/i;
const INJECTION_TERMS =
  /(?:ignore\s+(?:all\s+)?(?:previous|prior|above)?\s*instructions|system\s*:|developer\s*:|DAN\s+mode)\b/i;

function isMastraEligible(prompt: string): boolean {
  return (
    XAUUSD_TERMS.test(prompt) &&
    !OTHER_SYMBOL_TERMS.test(prompt) &&
    !MUTATING_TERMS.test(prompt) &&
    !INJECTION_TERMS.test(prompt)
  );
}

describe('AI eval prompt set', () => {
  it('contains a meaningful number of unique prompts', () => {
    expect(AI_EVAL_PROMPTS.length).toBeGreaterThanOrEqual(30);
    const ids = new Set(AI_EVAL_PROMPTS.map((p) => p.id));
    expect(ids.size).toBe(AI_EVAL_PROMPTS.length);
    const prompts = new Set(AI_EVAL_PROMPTS.map((p) => p.prompt));
    expect(prompts.size).toBe(AI_EVAL_PROMPTS.length);
  });

  it('routes every prompt through the Mastra XAUUSD gate', () => {
    const ineligible = AI_EVAL_PROMPTS.filter((p) => !isMastraEligible(p.prompt));
    expect(ineligible).toEqual([]);
  });
});
