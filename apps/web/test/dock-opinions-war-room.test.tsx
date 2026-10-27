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

// Regression guard for the Council War Room hydration path (review focus 1):
// reloading /chat/[threadId] leaves `agentProgress === null`, so the sidecar
// must rebuild the committee record from the newest persisted
// `data-multi-agent-meta` part instead of showing the empty placeholder.

import { cleanup, render, screen, within } from '@testing-library/react';
import type { UIMessage } from 'ai';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DockOpinionsPanel } from '@/components/chat/thread-views-dock/dock-opinions-panel';
import type { AgentProgress } from '@/lib/chat-transport';

vi.mock('next/image', () => ({
  default: (props: React.ImgHTMLAttributes<HTMLImageElement>) => {
    const { unoptimized, ...rest } = props as React.ImgHTMLAttributes<HTMLImageElement> & {
      unoptimized?: boolean;
    };
    return <img {...rest} alt="" />;
  },
}));

afterEach(cleanup);

const settledMetaMessage = {
  id: 'assistant-1',
  role: 'assistant',
  parts: [
    { type: 'text', text: 'Executive thesis…' },
    {
      type: 'data-multi-agent-meta',
      data: {
        mode: 'full',
        symbol: 'XAUUSD',
        dataQuality: 'complete',
        agentOpinions: [
          {
            agentName: 'technical',
            bias: 'bullish',
            confidence: 0.94,
            reasoning: '15m FVG sweep reclaimed.',
            model: 'claude-4-sonnet',
            latencyMs: 2400,
          },
          {
            agentName: 'fundamental',
            bias: 'bullish',
            confidence: 0.88,
            reasoning: 'Real yields compress.',
          },
          {
            agentName: 'risk',
            bias: 'bullish',
            confidence: 0.92,
            reasoning: 'Stop 1.4x ATR below entry.',
          },
          {
            agentName: 'sentiment',
            bias: 'neutral',
            confidence: 0.64,
            reasoning: 'COT net long but not crowded.',
          },
        ],
        committeeCritiques: [
          {
            agentName: 'risk',
            confirms: false,
            revisedConfidence: 0.92,
            critique: 'Tight 2,852 stop is inside 1H ATR noise.',
          },
        ],
      },
    },
  ],
} as unknown as UIMessage;

describe('DockOpinionsPanel — Syndicate War Room', () => {
  it('hydrates the 4 desks and clashes from persisted meta when agentProgress is null', () => {
    render(<DockOpinionsPanel agentProgress={null} messages={[settledMetaMessage]} />);

    // Never the empty placeholder on a thread that already ran the council.
    expect(screen.queryByText('4-Desk Committee Ready')).toBeNull();

    // Header telemetry + all 4 canonical desk codes.
    expect(screen.getByText('SYNDICATE WAR ROOM')).toBeTruthy();
    expect(screen.getByText(/XAUUSD · 4\/4 DESKS · 85% CONV/i)).toBeTruthy();
    const grid = within(screen.getByTestId('syndicate-desk-grid'));
    expect(grid.getByText('DESK-I // HORUS')).toBeTruthy();
    expect(grid.getByText('DESK-II // ASTROLABE')).toBeTruthy();
    expect(grid.getByText('DESK-III // HOPLITE')).toBeTruthy();
    expect(grid.getByText('DESK-IV // SENTINEL')).toBeTruthy();

    // Cross-examination ledger from `committeeCritiques`.
    expect(screen.getByText(/Adversarial Cross-Examination/i)).toBeTruthy();
    expect(screen.getByText('⚔️ CHALLENGED')).toBeTruthy();
    expect(screen.getByText(/Tight 2,852 stop is inside 1H ATR noise/i)).toBeTruthy();
  });

  it('renders the live Circuit Spine while a council run is in flight', () => {
    const live: AgentProgress = {
      mode: 'full',
      stage: 'critique',
      agents: [
        { agentName: 'technical', status: 'done' },
        { agentName: 'fundamental', status: 'done' },
        { agentName: 'risk', status: 'running' },
        { agentName: 'sentiment', status: 'pending' },
      ],
    };
    render(<DockOpinionsPanel agentProgress={live} messages={[]} />);

    expect(screen.getByText('LIVE COUNCIL TELEMETRY')).toBeTruthy();
    expect(screen.getByText(/Cross-Examination/)).toBeTruthy();
    expect(screen.getByText(/2\/4 DESKS/)).toBeTruthy();
  });

  it('falls back to the armed placeholder when there is no council record at all', () => {
    render(<DockOpinionsPanel agentProgress={null} messages={[]} />);
    expect(screen.getByText('4-Desk Committee Ready')).toBeTruthy();
  });
});
