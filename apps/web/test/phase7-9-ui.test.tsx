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

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { PasswordField } from '@/app/(auth)/_components/password-field';
import { TextPart } from '@/components/chat/parts/text';

afterEach(cleanup);

describe('Phase 7 — chat message reading', () => {
  it('preserves line breaks while streaming (no layout jump on finish)', () => {
    render(<TextPart role="assistant" isStreaming text={'First paragraph\n\nSecond paragraph'} />);
    const el = screen.getByText(/First paragraph/);
    expect(el.className).toContain('whitespace-pre-line');
  });

  it('does not attach a live region to the visible streaming text', () => {
    const { container } = render(<TextPart role="assistant" isStreaming text="streaming…" />);
    // The debounced sr-only StreamingLiveRegion owns announcements; a live
    // region here would re-announce the entire history on re-render.
    expect(container.querySelector('[aria-live]')).toBeNull();
  });

  it('marks the streaming caret as decorative', () => {
    const { container } = render(<TextPart role="assistant" isStreaming text="hello" />);
    const caret = container.querySelector('.animate-pulse');
    expect(caret).not.toBeNull();
    expect(caret?.getAttribute('aria-hidden')).toBe('true');
  });

  it('renders raw text (no markdown processing) while streaming', () => {
    render(<TextPart role="assistant" isStreaming text="**bold** not parsed yet" />);
    // The literal asterisks stay visible until the finished markdown render.
    expect(screen.getByText('**bold** not parsed yet')).toBeTruthy();
    expect(screen.queryByRole('strong')).toBeNull();
  });
});

describe('Phase 9 — auth components', () => {
  it('keeps the password visibility toggle keyboard-reachable', () => {
    render(<PasswordField value="" onChange={() => {}} />);
    const toggle = screen.getByRole('button', { name: 'Show password' });
    expect(toggle.getAttribute('tabindex')).not.toBe('-1');
  });

  it('toggles the password type and announces state via aria-pressed', () => {
    const { container } = render(<PasswordField value="secret" onChange={() => {}} />);
    const passwordInput = container.querySelector('#password') as HTMLInputElement;
    expect(passwordInput.type).toBe('password');

    const toggle = screen.getByRole('button', { name: 'Show password' });
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(toggle);
    expect(passwordInput.type).toBe('text');
    expect(screen.getByRole('button', { name: 'Hide password' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
  });
});
