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

// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';

afterEach(cleanup);

describe('Card', () => {
  it('renders the shared terminal surface by default', () => {
    const { container } = render(<Card>Content</Card>);
    const card = container.firstElementChild;

    expect(card?.classList.contains('border')).toBe(true);
    expect(card?.classList.contains('bg-bg-elev-1')).toBe(true);
    expect(screen.getByText('Content')).toBeTruthy();
  });

  it('supports semantic elements', () => {
    const { container } = render(<Card as="section">Section content</Card>);
    expect(container.firstElementChild?.tagName).toBe('SECTION');
  });

  it('preserves custom classes and composes slots', () => {
    render(
      <Card className="custom-card">
        <CardHeader>Header</CardHeader>
        <CardContent>Body</CardContent>
        <CardFooter>Footer</CardFooter>
      </Card>,
    );

    expect(screen.getByText('Header').closest('.custom-card')).toBeTruthy();
    expect(screen.getByText('Body')).toBeTruthy();
    expect(screen.getByText('Footer')).toBeTruthy();
  });
});
