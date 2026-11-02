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
// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  downloadCSV,
  formatAbsoluteTime,
  formatMs,
  formatNumber,
} from '@/lib/formatters/format-number';

// ── formatMs ──────────────────────────────────────────────────────────

describe('formatMs', () => {
  it.each([
    [0, '0ms'],
    [1, '1ms'],
    [500, '500ms'],
    [999, '999ms'],
    [999.6, '1000ms'], // rounds to nearest ms
    [1000, '1.0s'],
    [1500, '1.5s'],
    [2345, '2.3s'],
    [2999, '3.0s'],
    [60_000, '60.0s'],
    [1_234_567, '1234.6s'],
  ])('formats %dms as %j', (ms, expected) => {
    expect(formatMs(ms)).toBe(expected);
  });
});

// ── formatNumber ──────────────────────────────────────────────────────

describe('formatNumber', () => {
  it.each([
    [0, '0'],
    [999, '999'],
    [1_000, '1,000'],
    [1_234_567, '1,234,567'],
  ])('formats %d as %j', (n, expected) => {
    expect(formatNumber(n)).toBe(expected);
  });
});

// ── formatAbsoluteTime ────────────────────────────────────────────────

describe('formatAbsoluteTime', () => {
  it('produces a full locale string with year, month, day, time', () => {
    const result = formatAbsoluteTime('2026-07-24T12:30:00Z');
    expect(result).toContain('2026');
    expect(result).toContain('Jul');
    expect(result).toContain('24');
    // Time format varies by locale but should contain digits and colon
    expect(result).toMatch(/\d{1,2}:\d{2}/);
  });
});

// ── downloadCSV ───────────────────────────────────────────────────────

describe('downloadCSV', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // jsdom does not provide URL.createObjectURL; polyfill it before spying.
    if (!URL.createObjectURL) {
      URL.createObjectURL = vi.fn().mockReturnValue('blob:test');
    }
    if (!URL.revokeObjectURL) {
      URL.revokeObjectURL = vi.fn();
    }
  });

  it('does nothing for empty rows', () => {
    const createElementSpy = vi.spyOn(document, 'createElement');
    downloadCSV([], 'test.csv');
    expect(createElementSpy).not.toHaveBeenCalled();
  });

  it('triggers a download for non-empty rows and handles special values', () => {
    const clickSpy = vi.fn();
    const url = 'blob:test';

    vi.spyOn(URL, 'createObjectURL').mockReturnValue(url);
    vi.spyOn(URL, 'revokeObjectURL');

    const anchorSpy = { href: '', download: '', click: clickSpy };
    vi.spyOn(document, 'createElement').mockReturnValue(anchorSpy as unknown as HTMLElement);

    downloadCSV(
      [
        { name: 'Doe, John', role: 'admin' },
        { name: 'Bob', role: null, extra: undefined },
      ],
      'users.csv',
    );

    expect(URL.createObjectURL).toHaveBeenCalled();
    expect(clickSpy).toHaveBeenCalled();
    expect(anchorSpy.download).toBe('users.csv');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(url);
  });
});
