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

import { cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { extractSyndicateTradeLevels } from '@/components/chat/parts/syndicate-dossier/extract-trade-levels';
import { SyndicateCircuitLive } from '@/components/chat/parts/syndicate-dossier/syndicate-circuit-live';

// Mock next/image to render a plain <img> in jsdom.
vi.mock('next/image', () => ({
  default: (props: React.ImgHTMLAttributes<HTMLImageElement>) => {
    const { unoptimized, ...rest } = props as React.ImgHTMLAttributes<HTMLImageElement> & {
      unoptimized?: boolean;
    };
    return <img {...rest} alt="" />;
  },
}));

afterEach(cleanup);

describe('extractSyndicateTradeLevels', () => {
  it('computes a weighted bullProbability and direction from desk opinions', () => {
    const bullish = extractSyndicateTradeLevels({
      symbol: 'XAUUSD',
      opinions: [
        { agentName: 'technical', bias: 'bullish', confidence: 0.94 },
        { agentName: 'fundamental', bias: 'bullish', confidence: 0.88 },
        { agentName: 'risk', bias: 'bullish', confidence: 0.92 },
        { agentName: 'sentiment', bias: 'neutral', confidence: 0.64 },
      ],
    });
    expect(bullish.symbol).toBe('XAUUSD');
    expect(bullish.direction).toBe('BUY');
    expect(bullish.bullProbability).toBeGreaterThanOrEqual(85);
    expect(bullish.bullProbability).toBeLessThanOrEqual(96);
    expect(bullish.dissent).toBe(false);
    expect(bullish.isVetoed).toBe(false);

    const bearish = extractSyndicateTradeLevels({
      opinions: [
        { agentName: 'technical', bias: 'bearish', confidence: 0.8 },
        { agentName: 'fundamental', bias: 'bearish', confidence: 0.7 },
      ],
    });
    expect(bearish.direction).toBe('SELL');
    expect(bearish.bullProbability).toBeLessThanOrEqual(15);

    // No opinions at all → neutral 50/50 bar, never a crash.
    const empty = extractSyndicateTradeLevels({});
    expect(empty.direction).toBe('NEUTRAL');
    expect(empty.bullProbability).toBe(50);
    expect(empty.entry).toBe('—');
  });

  it('extracts entry/invalidation/tp1/tp2/rr from structured keyLevels arrays', () => {
    const levels = extractSyndicateTradeLevels({
      symbol: 'XAUUSD',
      opinions: [
        {
          agentName: 'technical',
          bias: 'bullish',
          confidence: 0.9,
          rawData: {
            keyLevels: [
              { price: 2860.2, kind: 'trigger' },
              { price: 2878, kind: 'resistance' },
              { price: 2895, kind: 'resistance' },
              { price: 2846.5, kind: 'invalidation' },
            ],
          },
        },
      ],
      text: 'Risk-reward: 1:2.5 with a 1.0% risk budget.',
    });
    expect(levels.entry).toBe('2,860.2');
    expect(levels.invalidation).toBe('2,846.5');
    expect(levels.tp1).toBe('2,878');
    expect(levels.tp2).toBe('2,895');
    expect(levels.rr).toBe('1:2.5');
  });

  it('extracts levels from loose keyLevels objects and markdown text', () => {
    const fromObject = extractSyndicateTradeLevels({
      symbol: 'XAUUSD',
      opinions: [
        {
          agentName: 'risk',
          bias: 'bullish',
          confidence: 0.9,
          rawData: {
            keyLevels: {
              entryZone: '2,860.20',
              invalidation: '2,846.50',
              tp1: '2,878.00',
              tp2: '2,895.00',
              rr: '1:2.5',
            },
          },
        },
      ],
    });
    expect(fromObject.entry).toBe('2,860.20');
    expect(fromObject.invalidation).toBe('2,846.50');
    expect(fromObject.tp1).toBe('2,878.00');
    expect(fromObject.tp2).toBe('2,895.00');
    expect(fromObject.rr).toBe('1:2.5');

    const fromText = extractSyndicateTradeLevels({
      symbol: 'EURUSD',
      text: [
        '### Certified Execution Blueprint',
        '- **Entry Zone**: 1.0845',
        '- **Invalidation (SL)**: 1.0790',
        '- **TP1 (40% SCALE)**: 1.0910',
        '- **TP2 RUNNER**: 1.0980',
        '- R:R 1:2.4',
      ].join('\n'),
    });
    expect(fromText.entry).toBe('1.0845');
    expect(fromText.invalidation).toBe('1.0790');
    expect(fromText.tp1).toBe('1.0910');
    expect(fromText.tp2).toBe('1.0980');
    expect(fromText.rr).toBe('1:2.4');
  });

  it('flags a Hoplite risk veto on low-confidence neutrality, dissent, or breach phrasing', () => {
    const withheld = extractSyndicateTradeLevels({
      symbol: 'XAUUSD',
      opinions: [
        { agentName: 'technical', bias: 'bullish', confidence: 0.9 },
        {
          agentName: 'risk',
          bias: 'neutral',
          confidence: 0.35,
          reasoning: 'Volatility is too elevated for a valid stop inside the 1% budget.',
        },
      ],
    });
    expect(withheld.isVetoed).toBe(true);
    expect(withheld.vetoReason).toMatch(/HOPLITE/i);

    const dissentingRisk = extractSyndicateTradeLevels({
      opinions: [
        { agentName: 'technical', bias: 'bullish', confidence: 0.9 },
        { agentName: 'risk', bias: 'bearish', confidence: 0.8, reasoning: 'Distribution below.' },
      ],
    });
    expect(dissentingRisk.isVetoed).toBe(true);

    const breach = extractSyndicateTradeLevels({
      opinions: [
        {
          agentName: 'risk',
          bias: 'bullish',
          confidence: 0.9,
          reasoning: 'RISK VETO: the 1H close breached invalidation at 2,846.50.',
        },
      ],
    });
    expect(breach.isVetoed).toBe(true);
    expect(breach.vetoReason).toMatch(/RISK VETO/i);

    const clean = extractSyndicateTradeLevels({
      opinions: [
        {
          agentName: 'risk',
          bias: 'bullish',
          confidence: 0.9,
          reasoning: 'Stop sits 1.4× ATR below entry; size 1.0% of capital.',
        },
      ],
    });
    expect(clean.isVetoed).toBe(false);
    expect(clean.vetoReason).toBeNull();
  });
});

describe('SyndicateCircuitLive', () => {
  function fullProgress(stage: string) {
    return {
      mode: 'full',
      stage,
      agents: [
        { agentName: 'technical', status: 'done' as const },
        { agentName: 'fundamental', status: 'done' as const },
        { agentName: 'risk', status: 'running' as const },
        { agentName: 'sentiment', status: 'pending' as const },
      ],
    };
  }

  it('renders the five council stages and highlights Cross-Examination at the critique stage', () => {
    render(<SyndicateCircuitLive agentProgress={fullProgress('critique')} />);

    expect(screen.getByText(/Market Packet/)).toBeTruthy();
    expect(screen.getByText(/4-Desk Deliberation/)).toBeTruthy();
    expect(screen.getByText(/Cross-Examination/)).toBeTruthy();
    expect(screen.getByText(/Risk Audit/)).toBeTruthy();
    expect(screen.getByText(/Arbiter Synthesis/)).toBeTruthy();

    const clash = screen.getByText(/Cross-Examination/).closest('[data-stage]');
    expect(clash?.getAttribute('data-stage')).toBe('critique');
    expect(clash?.getAttribute('data-active')).toBe('true');
    expect(screen.getByText(/Cross-Critique Active/i)).toBeTruthy();

    const packet = screen.getByText(/Market Packet/).closest('[data-stage]');
    expect(packet?.getAttribute('data-active')).toBe('false');
  });

  it('renders the live 4-desk matrix with canonical codes and bias pills', () => {
    render(
      <SyndicateCircuitLive
        agentProgress={{
          mode: 'full',
          stage: 'sentiment',
          agents: [
            {
              agentName: 'technical',
              status: 'done',
              opinion: { agentName: 'technical', bias: 'bullish', confidence: 0.94, reasoning: '' },
            },
            {
              agentName: 'risk',
              status: 'done',
              opinion: { agentName: 'risk', bias: 'bullish', confidence: 0.92, reasoning: '' },
            },
            { agentName: 'sentiment', status: 'running' },
          ],
        }}
      />,
    );

    expect(screen.getByText('DESK-I // HORUS')).toBeTruthy();
    expect(screen.getByText('DESK-II // ASTROLABE')).toBeTruthy();
    expect(screen.getByText('DESK-III // HOPLITE')).toBeTruthy();
    expect(screen.getByText('DESK-IV // SENTINEL')).toBeTruthy();
    expect(screen.getByText(/bullish · 94%/i)).toBeTruthy();
    expect(screen.getByText(/Analyzing/i)).toBeTruthy();
  });

  it('renders a compact 3-stage strip in single (Fast Scout) mode', () => {
    render(<SyndicateCircuitLive agentProgress={{ mode: 'single', agents: [] }} />);
    expect(screen.getByText(/FAST SCOUT · SINGLE-PASS READ/i)).toBeTruthy();
    expect(screen.getByText(/Specialist Desk/)).toBeTruthy();
    expect(screen.getByText(/Verification/)).toBeTruthy();
    expect(screen.queryByText(/4-Desk Deliberation/)).toBeNull();
    expect(screen.queryByText('DESK-I // HORUS')).toBeNull();
  });
});
