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

// Phase 2 journal contract: the AI review panel reviews ANY closed trade.
// It previously hard-wired the single newest closed trade with no way to pick
// another one.

import type { JournalEntry } from '@kestrel/shared';
import { cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { AiReviewPanel } from '@/app/(app)/journal/_components/ai-review-panel';

afterEach(cleanup);

function makeEntry(partial: Partial<JournalEntry>): JournalEntry {
  return {
    id: 'entry-1',
    symbol: 'XAUUSD',
    side: 'long',
    openedAt: 1_700_000_000_000,
    closedAt: 1_700_086_400_000,
    entry: 2000,
    stop: 1990,
    target: 2030,
    exit: 2030,
    size: 1,
    outcome: 'win',
    rMultiple: 3,
    notes: null,
    tags: [],
    attachments: [],
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_086_400_000,
    ...partial,
  } as JournalEntry;
}

const closedTrades: JournalEntry[] = [
  makeEntry({ id: 'newest', symbol: 'XAUUSD', rMultiple: 2.5, outcome: 'win' }),
  makeEntry({ id: 'older', symbol: 'EURUSD', side: 'short', rMultiple: -1, outcome: 'loss' }),
];

describe('AiReviewPanel trade picker', () => {
  it('lists every closed trade, not just the newest one', () => {
    render(<AiReviewPanel entries={closedTrades} />);

    const select = screen.getByLabelText('Closed trade to review');
    const optionIds = Array.from(select.querySelectorAll('option')).map((o) => o.getAttribute('value'));

    expect(optionIds).toEqual(['newest', 'older']);
  });

  it('defaults to the newest closed trade', () => {
    render(<AiReviewPanel entries={closedTrades} />);

    const select = screen.getByLabelText('Closed trade to review') as HTMLSelectElement;
    expect(select.value).toBe('newest');
  });

  it('ignores open positions when building the picker', () => {
    render(
      <AiReviewPanel
        entries={[makeEntry({ id: 'open-1', outcome: 'open', closedAt: null }), ...closedTrades]}
      />,
    );

    const select = screen.getByLabelText('Closed trade to review');
    const optionIds = Array.from(select.querySelectorAll('option')).map((o) => o.getAttribute('value'));

    expect(optionIds).toEqual(['newest', 'older']);
  });

  it('prompts the user to close a trade when nothing is closed yet', () => {
    render(<AiReviewPanel entries={[makeEntry({ id: 'open-1', outcome: 'open', closedAt: null })]} />);

    expect(screen.getByText(/Close a trade to unlock an AI-powered post-trade review/)).toBeTruthy();
    expect(screen.queryByLabelText('Closed trade to review')).toBeNull();
  });
});
