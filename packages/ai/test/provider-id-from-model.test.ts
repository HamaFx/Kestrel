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

import { describe, expect, it } from 'vitest';

// We re-export providerIdFromModel via index.ts; import the test
// directly through the file path so we can run it without a DB
// (the usage module also pulls in @kestrel/db, which is fine —
// this test only exercises the pure helpers).
import { providerIdFromModel } from '../src/budget/usage';

describe('Phase D — providerIdFromModel', () => {
  it('returns the segment before the first slash for prefixed ids', () => {
    expect(providerIdFromModel('google/gemini-2.5-flash')).toBe('google');
    expect(providerIdFromModel('anthropic/claude-sonnet-4-20250514')).toBe('anthropic');
    expect(providerIdFromModel('openai/gpt-4o')).toBe('openai');
  });

  it('returns empty string for bare model ids (BYOK google)', () => {
    expect(providerIdFromModel('gemini-2.5-flash')).toBe('');
    expect(providerIdFromModel('gemini-2.5-pro')).toBe('');
  });

  it('handles model ids with multiple slashes (after the first)', () => {
    // Some gateway ids look like "openai/gpt-4o/ft-abc123" — we
    // only split on the FIRST slash so the rest stays intact.
    expect(providerIdFromModel('openai/gpt-4o/ft-abc123')).toBe('openai');
    expect(providerIdFromModel('openrouter/anthropic/claude-3.5-sonnet')).toBe('openrouter');
  });

  it('returns empty string for empty input', () => {
    expect(providerIdFromModel('')).toBe('');
  });
});
