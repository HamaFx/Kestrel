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

import { cn } from '../src/lib/formatters/cn';

const CASES: Array<{ label: string; args: Parameters<typeof cn>; expected: string }> = [
  // Basic merging
  { label: 'returns a single class unchanged', args: ['px-4'], expected: 'px-4' },
  { label: 'joins multiple classes with a space', args: ['px-4', 'py-2'], expected: 'px-4 py-2' },
  {
    label: 'handles conditional classes and filters falsy values',
    args: ['base', 'visible', false, null, undefined, 0],
    expected: 'base visible',
  },
  // clsx features
  { label: 'handles object arguments', args: [{ foo: true, bar: false }], expected: 'foo' },
  { label: 'handles array arguments', args: [['a', 'b'], 'c'], expected: 'a b c' },
  {
    label: 'handles mixed objects and strings',
    args: ['static', { conditional: true, hidden: false }],
    expected: 'static conditional',
  },
  {
    label: 'handles nested objects (value used as truthy check)',
    args: [{ a: true, b: { c: true } }],
    expected: 'a b',
  },
  { label: 'handles deeply nested arrays', args: [['a', ['b', ['c']]]], expected: 'a b c' },
  // tailwind-merge conflict resolution
  { label: 'resolves padding conflicts (last wins)', args: ['px-4', 'px-8'], expected: 'px-8' },
  { label: 'resolves margin conflicts', args: ['m-2', 'm-4'], expected: 'm-4' },
  {
    label: 'keeps non-conflicting classes from both sides',
    args: ['px-4', 'py-2'],
    expected: 'px-4 py-2',
  },
  {
    label: 'resolves conflicting utility in opposite order',
    args: ['px-8', 'px-4'],
    expected: 'px-4',
  },
  { label: 'resolves arbitrary value conflicts', args: ['p-[10px]', 'p-4'], expected: 'p-4' },
  {
    label: 'merges non-conflicting arbitrary values',
    args: ['p-[10px]', 'm-4'],
    expected: 'p-[10px] m-4',
  },
  {
    label: 'resolves color shade conflicts',
    args: ['text-red-500', 'text-blue-700'],
    expected: 'text-blue-700',
  },
  {
    label: 'resolves flex direction conflicts',
    args: ['flex-row', 'flex-col'],
    expected: 'flex-col',
  },
  { label: 'resolves width conflicts', args: ['w-full', 'w-1/2'], expected: 'w-1/2' },
  {
    label: 'resolves display conflicts',
    args: ['block', 'inline-flex'],
    expected: 'inline-flex',
  },
  // Edge cases
  { label: 'returns empty string for no arguments', args: [], expected: '' },
  {
    label: 'returns empty string for all falsy values',
    args: [false, null, undefined, ''],
    expected: '',
  },
];

describe('cn — class merging', () => {
  it.each(CASES)('$label', ({ args, expected }) => {
    expect(cn(...args)).toBe(expected);
  });
});
