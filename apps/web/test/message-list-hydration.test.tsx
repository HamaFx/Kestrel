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
// SPDX-License-Identifier: Apache-2.0

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import type { UIMessage } from 'ai';
import React, { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { MessageList } from '@/components/chat/message-list';

vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: (options: { count: number; getScrollElement: () => HTMLDivElement | null }) => {
    const ready = options.getScrollElement() !== null;
    return {
      getTotalSize: () => options.count * 100,
      getVirtualItems: () =>
        ready
          ? Array.from({ length: options.count }, (_, index) => ({
              index,
              key: index,
              start: index * 100,
            }))
          : [],
      measureElement: () => {},
    };
  },
}));

vi.mock('@/components/chat/message', () => ({
  Message: ({ message }: { message: UIMessage }) => (
    <div data-testid="hydrated-message">
      {message.parts
        .filter((part) => part.type === 'text')
        .map((part) => ('text' in part ? part.text : ''))
        .join('')}
    </div>
  ),
}));

afterEach(cleanup);

describe('MessageList hydration', () => {
  it('renders persisted messages after the scroll ref attaches', async () => {
    const messages: UIMessage[] = [
      {
        id: 'user-1',
        role: 'user',
        parts: [{ type: 'text', text: 'What is the gold bias?' }],
      },
      {
        id: 'assistant-1',
        role: 'assistant',
        parts: [{ type: 'text', text: 'Gold is holding a bullish intraday bias.' }],
      },
    ];

    function Harness() {
      const [scrollElement, setScrollElement] = useState<HTMLDivElement | null>(null);
      return (
        <div ref={setScrollElement}>
          <MessageList messages={messages} scrollElement={scrollElement} />
        </div>
      );
    }

    render(<Harness />);

    await waitFor(() => {
      expect(screen.getAllByTestId('hydrated-message')).toHaveLength(2);
    });
    expect(screen.getByText('What is the gold bias?')).toBeTruthy();
    expect(screen.getByText('Gold is holding a bullish intraday bias.')).toBeTruthy();
  });
});
