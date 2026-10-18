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

import '@testing-library/jest-dom/vitest';

import { webcrypto } from 'node:crypto';

import React from 'react';
import { vi } from 'vitest';

vi.mock('next-view-transitions', () => ({
  Link: ({ children, href, ...props }: any) =>
    React.createElement(
      'a',
      { href: typeof href === 'string' ? href : undefined, ...props },
      children,
    ),
  useTransitionRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

if (!process.env.DATABASE_URL && !process.env.POSTGRES_URL) {
  process.env.DATABASE_URL = 'postgres://test:test@localhost:5432/test';
}

if (!globalThis.crypto || !globalThis.crypto.subtle) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).crypto = webcrypto;
}

if (typeof window !== 'undefined' && typeof PointerEvent === 'undefined') {
  class PointerEventPolyfill extends Event {
    constructor(type: string, options: EventInit = {}) {
      super(type, options);
    }
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).PointerEvent = PointerEventPolyfill;
}
