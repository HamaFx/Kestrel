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

import { describe, expect, it } from 'vitest';

import { cleanNewsText } from '@/lib/clean-news-text';

describe('cleanNewsText', () => {
  it('decodes common entities and removes malformed tag fragments', () => {
    expect(cleanNewsText('Gold &amp; dollar <n><\\n> rally')).toBe('Gold & dollar rally');
  });

  it('normalizes literal and actual line breaks without exposing markup', () => {
    expect(cleanNewsText('CPI\\n<\n> beats\n expectations')).toBe('CPI beats expectations');
  });

  it('handles double-encoded entities and numeric entities', () => {
    expect(cleanNewsText('Markets &amp;lt;calm&amp;gt; &#39;today&#39;')).toBe(
      "Markets calm 'today'",
    );
  });

  it('does not interpret plain text as HTML', () => {
    expect(cleanNewsText('Use <3 risk and keep 2 < 3')).toBe('Use <3 risk and keep 2 < 3');
  });

  it('removes closing pseudo-tags and double-escaped line breaks', () => {
    expect(cleanNewsText('Gold</n>\\\\n rally')).toBe('Gold rally');
  });

  it('collapses provider control characters and whitespace', () => {
    expect(cleanNewsText('  Fed\tdecision\r\n  today  ')).toBe('Fed decision today');
  });
});
