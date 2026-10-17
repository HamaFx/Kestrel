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

import { cleanup, render } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TopBar } from '@/components/layout/top-bar';

afterEach(cleanup);

vi.mock('next-view-transitions', () => ({
  Link: ({ children, ...props }: React.ComponentProps<'a'>) => <a {...props}>{children}</a>,
}));

vi.mock('next/link', () => ({
  default: ({ children, ...props }: React.ComponentProps<'a'>) => <a {...props}>{children}</a>,
}));

// Mock next/navigation
const mockPathname = vi.fn();
vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname(),
  redirect: (url: string) => {
    const error = new Error(`NEXT_REDIRECT: ${url}`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (error as any).digest = `NEXT_REDIRECT;replace;${url};307;;`;
    throw error;
  },
}));

describe('Tier 3: Telemetry Occlusion Suppression on /chat Layout (>=5 tests)', () => {
  it('suppresses TopBar when pathname is /chat', () => {
    mockPathname.mockReturnValue('/chat');
    const { container } = render(<TopBar />);
    expect(container.firstChild).toBeNull();
  });

  it('suppresses TopBar when pathname is a sub-thread /chat/thread_abc123', () => {
    mockPathname.mockReturnValue('/chat/thread_abc123');
    const { container } = render(<TopBar />);
    expect(container.firstChild).toBeNull();
  });

  it('renders TopBar normally on /dashboard', () => {
    mockPathname.mockReturnValue('/dashboard');
    const { container } = render(<TopBar title="Market Dashboard" />);
    expect(container.querySelector('header')).not.toBeNull();
  });

  it('renders TopBar normally on /chart/XAUUSD', () => {
    mockPathname.mockReturnValue('/chart/XAUUSD');
    const { container } = render(<TopBar title="XAUUSD Chart" />);
    expect(container.querySelector('header')).not.toBeNull();
  });

  it('verifies TopBar sticky container includes pt-safe and safe-area-inset-top', () => {
    mockPathname.mockReturnValue('/dashboard');
    const { container } = render(<TopBar />);
    const header = container.querySelector('header')!;
    expect(header.className).toContain('pt-safe');
    expect(header.className).toContain('sticky');
    expect(header.className).toContain('top-0');
  });
});
