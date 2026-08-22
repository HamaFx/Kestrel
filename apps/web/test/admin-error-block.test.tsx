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

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AdminErrorBlock } from '@/app/(app)/admin/_components/admin-error-block';

describe('AdminErrorBlock', () => {
  afterEach(() => cleanup());

  it('renders the error message', () => {
    render(<AdminErrorBlock message="Something went wrong" onRetry={vi.fn()} />);
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });

  it('renders a Retry button', () => {
    render(<AdminErrorBlock message="Error" onRetry={vi.fn()} />);
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });

  it('calls onRetry when the button is clicked', () => {
    const onRetry = vi.fn();
    render(<AdminErrorBlock message="Error" onRetry={onRetry} />);

    fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('applies danger color to the error text', () => {
    const { container } = render(<AdminErrorBlock message="Error" onRetry={vi.fn()} />);
    const messageEl = container.querySelector('.text-danger');
    expect(messageEl).toBeInTheDocument();
    expect(messageEl!.textContent).toBe('Error');
  });

  it('centers the content', () => {
    const { container } = render(<AdminErrorBlock message="Error" onRetry={vi.fn()} />);
    const wrapper = container.firstElementChild!;
    expect(wrapper.className).toContain('text-center');
    expect(wrapper.className).toContain('flex');
    expect(wrapper.className).toContain('flex-col');
  });
});
