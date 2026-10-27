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

// Web Share Target payload handling.
//
// Everything here arrives from outside the app (another app on the device, or a
// hand-edited URL), and the result is embedded in a `?prompt=` query string, so
// the tests care about two things: the prompt never contains anything the user
// did not share, and its encoded form always fits in a URL.
import { describe, expect, it } from 'vitest';

import {
  buildShareIntent,
  fitToEncodedBudget,
  MAX_ENCODED_PROMPT,
  SHARE_TARGET_ACTION,
} from '@/lib/pwa/share-target';

describe('buildShareIntent', () => {
  it('mirrors the app’s other Ask-AI prompts', () => {
    const intent = buildShareIntent({
      title: 'Gold spikes on CPI miss',
      text: 'The print came in below consensus.',
      url: 'https://example.com/gold',
    });

    expect(intent?.prompt).toBe(
      [
        'What does this mean for my trading?',
        '',
        'Title: Gold spikes on CPI miss',
        'Shared: The print came in below consensus.',
        'https://example.com/gold',
      ].join('\n'),
    );
    expect(intent?.title).toBe('Gold spikes on CPI miss');
  });

  it('works with only a link', () => {
    const intent = buildShareIntent({ url: 'https://example.com/a' });
    expect(intent?.prompt).toContain('https://example.com/a');
    expect(intent?.title).toBeNull();
  });

  it('works with only text', () => {
    const intent = buildShareIntent({ text: 'XAUUSD weekly open gap' });
    expect(intent?.prompt).toContain('Shared: XAUUSD weekly open gap');
  });

  it('returns null when there is nothing to share', () => {
    expect(buildShareIntent({})).toBeNull();
    expect(buildShareIntent({ title: '   ', text: '\n\n' })).toBeNull();
  });

  it('drops URLs that are not absolute http(s)', () => {
    for (const url of [
      'javascript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'file:///etc/passwd',
      'not a url',
      '/relative/path',
    ]) {
      const intent = buildShareIntent({ title: 'x', url });
      expect(intent?.prompt, url).not.toContain(url);
      expect(intent?.prompt).not.toContain('http');
    }
  });

  it('keeps an absolute http(s) URL, including its query', () => {
    const intent = buildShareIntent({ url: 'https://example.com/a?b=1#frag' });
    expect(intent?.prompt).toContain('https://example.com/a?b=1#frag');
  });

  it('takes the first value when a param is repeated', () => {
    const intent = buildShareIntent({ title: ['first', 'second'] });
    expect(intent?.prompt).toContain('Title: first');
    expect(intent?.prompt).not.toContain('second');
  });

  it('strips control characters and bidi overrides', () => {
    const intent = buildShareIntent({
      title: 'Gold\u0000\u202espikes\u001b[31m',
      text: 'line one\r\n\r\n\r\nline two',
    });

    expect(intent?.prompt).not.toMatch(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u202a-\u202e]/);
    expect(intent?.prompt).toContain('Title: Gold spikes [31m');
    // Runs of blank lines collapse to one line break.
    expect(intent?.prompt).toContain('Shared: line one\nline two');
  });

  it('caps a huge text payload', () => {
    const intent = buildShareIntent({ text: 'x'.repeat(50_000) });
    expect(intent!.prompt.length).toBeLessThan(6_000);
  });

  it('never splits a surrogate pair when truncating', () => {
    const intent = buildShareIntent({ title: '🦅'.repeat(500) });
    expect(intent?.prompt).toContain('🦅');
    // A lone surrogate would survive JSON but break the encoded URL.
    expect(intent?.prompt).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/);
  });

  it('always fits the encoded prompt in a URL, even for CJK payloads', () => {
    // CJK encodes to 9 bytes per character once percent-encoded, which is the
    // worst case for a query string.
    const intent = buildShareIntent({ text: '黄金价格分析'.repeat(500) });
    expect(encodeURIComponent(intent!.prompt).length).toBeLessThanOrEqual(MAX_ENCODED_PROMPT);
    expect(intent?.prompt.endsWith('…')).toBe(true);
  });
});

describe('fitToEncodedBudget', () => {
  it('leaves a string that already fits untouched', () => {
    expect(fitToEncodedBudget('short', 100)).toBe('short');
  });

  it('cuts to the encoded budget and marks the truncation', () => {
    const result = fitToEncodedBudget('a'.repeat(500), 50);
    expect(result.endsWith('…')).toBe(true);
    expect(encodeURIComponent(result).length).toBeLessThanOrEqual(50);
  });

  it('never leaves a dangling high surrogate', () => {
    const result = fitToEncodedBudget('🦅'.repeat(200), 40);
    expect(result).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/);
    expect(encodeURIComponent(result).length).toBeLessThanOrEqual(40);
  });
});

describe('share target registration', () => {
  it('points at the receiver route', () => {
    expect(SHARE_TARGET_ACTION).toBe('/share/receive');
  });
});
