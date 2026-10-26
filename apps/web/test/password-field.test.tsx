// @vitest-environment jsdom
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

// Contract for the shared auth PasswordField: every password input gets a
// real labelled field (login/register/reset) and a Show/Hide toggle.

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PasswordField } from '../src/app/(auth)/_components/password-field';

afterEach(cleanup);

describe('PasswordField', () => {
  it('associates the visible label with the input it names', () => {
    render(
      <PasswordField
        id="confirm-password"
        name="confirmPassword"
        label="Confirm Password"
        value=""
        onChange={vi.fn()}
      />,
    );

    const input = screen.getByLabelText('Confirm Password');
    expect(input.getAttribute('id')).toBe('confirm-password');
    expect(input.getAttribute('name')).toBe('confirmPassword');
    expect(input.getAttribute('type')).toBe('password');
  });

  it('renders no label element when the label prop is omitted', () => {
    const { container } = render(<PasswordField value="" onChange={vi.fn()} />);
    expect(container.querySelector('label')).toBeNull();
  });

  it('toggles the input between masked and plain text', () => {
    render(<PasswordField label="Password" value="hunter2" onChange={vi.fn()} />);

    const input = screen.getByLabelText('Password');
    expect(input.getAttribute('type')).toBe('password');

    fireEvent.click(screen.getByLabelText('Show password'));
    expect(input.getAttribute('type')).toBe('text');

    fireEvent.click(screen.getByLabelText('Hide password'));
    expect(input.getAttribute('type')).toBe('password');
  });

  it('marks the input invalid and links the error description when error is set', () => {
    render(
      <PasswordField
        id="confirm-password"
        label="Confirm Password"
        value="mismatch"
        onChange={vi.fn()}
        error
        errorId="confirm-password-error"
      />,
    );

    const input = screen.getByLabelText('Confirm Password');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('aria-describedby')).toBe('confirm-password-error');
  });
});
