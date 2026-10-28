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

// Guards the <IconBadge> tone housings against a silent-cascade regression.
//
// Tailwind v4 emits custom `@utility` rules *after* the core colour utilities
// inside `@layer utilities`. At equal specificity the housing therefore always
// wins, so a tone written as `bg-danger/10 text-danger border-danger/30` on top
// of a housing utility renders as the neutral surface: the classes are present
// in the DOM, read as intent, and do nothing. A class-name assertion cannot
// catch that — this checks for the offending shape directly.

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { IconBadge, type IconBadgeTone } from '@/components/ui/icon-badge';

const TONES: IconBadgeTone[] = ['brand', 'neutral', 'bull', 'bear', 'danger', 'warn', 'info'];

/** Class groups the housing utilities own, and would therefore override. */
const HARMLESS_PREFIXES = ['bg-', 'border', 'text-', 'ring-', 'shadow'];

function overriddenClasses(className: string): string[] {
  return className
    .split(/\s+/)
    .filter((token) => HARMLESS_PREFIXES.some((prefix) => token.startsWith(prefix)));
}

describe('<IconBadge> tone housings', () => {
  afterEach(cleanup);

  it.each(TONES)('tone "%s" is expressed only through its housing utility', (tone) => {
    const { container } = render(<IconBadge tone={tone} />);
    const root = container.firstElementChild as HTMLElement;

    expect(root.className).toMatch(/\bicon-housing/);
    expect(overriddenClasses(root.className)).toEqual([]);
  });

  it('gives every tone a distinct housing utility', () => {
    const housings = TONES.map((tone) => {
      const { container, unmount } = render(<IconBadge tone={tone} />);
      const root = container.firstElementChild as HTMLElement;
      const housing = root.className.split(/\s+/).filter((t) => t.startsWith('icon-housing'));
      unmount();
      return housing.join(' ');
    });

    expect(new Set(housings).size).toBe(TONES.length);
    for (const housing of housings) expect(housing).not.toBe('');
  });
});
