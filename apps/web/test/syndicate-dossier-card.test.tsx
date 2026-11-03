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

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AgentProgress } from '@/components/chat/parts/agent-deliberation/agent-meta';
import { MastraReportPart } from '@/components/chat/parts/mastra-report';
import { SyndicateDossierCard } from '@/components/chat/parts/syndicate-dossier';

vi.mock('next/image', () => ({
  default: (props: React.ImgHTMLAttributes<HTMLImageElement>) => {
    const { unoptimized: _unoptimized, ...rest } =
      props as React.ImgHTMLAttributes<HTMLImageElement> & {
        unoptimized?: boolean;
      };
    return <img {...rest} alt="" />;
  },
}));

afterEach(cleanup);

function alignedDesks(): AgentProgress[] {
  return [
    {
      agentName: 'fundamental',
      status: 'done',
      opinion: {
        agentName: 'fundamental',
        bias: 'bullish',
        confidence: 0.88,
        reasoning: 'Real yields compress while DXY rolls over.',
        model: 'claude-4-sonnet',
        latencyMs: 2400,
      },
    },
    {
      agentName: 'technical',
      status: 'done',
      opinion: {
        agentName: 'technical',
        bias: 'bullish',
        confidence: 0.94,
        reasoning: '15m swing low reclaimed with an EMA reclaim.',
      },
    },
    {
      agentName: 'risk',
      status: 'done',
      opinion: {
        agentName: 'risk',
        bias: 'bullish',
        confidence: 0.92,
        reasoning: 'Stop sits 1.4x ATR below entry; 1.0% budget holds.',
      },
    },
    {
      agentName: 'sentiment',
      status: 'done',
      opinion: {
        agentName: 'sentiment',
        bias: 'neutral',
        confidence: 0.64,
        reasoning: 'COT net long but not crowded.',
      },
    },
  ];
}

/** Bullish technical/risk vs. bearish macro: dissent without a veto. */
function dissentingDesks(): AgentProgress[] {
  const agents = alignedDesks();
  agents[0] = {
    agentName: 'fundamental',
    status: 'done',
    opinion: {
      agentName: 'fundamental',
      bias: 'bearish',
      confidence: 0.7,
      reasoning: 'Real yields still restrictive.',
    },
  };
  return agents;
}

describe('SyndicateDossierCard', () => {
  it('renders the Tug-of-War bar, the 4 instrument wells, and the canonical desk codes', () => {
    render(
      <SyndicateDossierCard
        agents={alignedDesks()}
        opinions={alignedDesks()}
        mode="full"
        symbol="XAUUSD"
        tradeOpinions={[
          {
            agentName: 'technical',
            bias: 'bullish',
            confidence: 0.94,
            rawData: {
              keyLevels: {
                entry: '2,860.20',
                invalidation: '2,846.50',
                tp1: '2,878.00',
                tp2: '2,895.00',
                rr: '1:2.5',
              },
            },
          },
        ]}
      />,
    );

    // Verified header + deterministic plan id + GO badge
    expect(screen.getByText(/VERIFIED SYNDICATE DOSSIER · XAUUSD/i)).toBeTruthy();
    expect(screen.getByText(/PLAN #KSL-[0-9A-F]{4}/)).toBeTruthy();
    expect(screen.getByText(/BUY \/ GO/i)).toBeTruthy();

    // Tug-of-War consensus bar
    expect(screen.getByText(/BULLISH \d+%/i)).toBeTruthy();
    expect(screen.getByText(/BEARISH \d+%/i)).toBeTruthy();

    // 4 deep instrument wells
    expect(screen.getByText('ENTRY ZONE')).toBeTruthy();
    expect(screen.getByText('2,860.20')).toBeTruthy();
    expect(screen.getByText('INVALIDATION (SL)')).toBeTruthy();
    expect(screen.getByText('TP1 (40% SCALE)')).toBeTruthy();
    expect(screen.getByText(/TP2 RUNNER \(1:2.5\)/)).toBeTruthy();

    // The settled 4-Desk Matrix carries the canonical descriptor codes.
    expect(screen.getByText('DESK-I // HORUS')).toBeTruthy();
    expect(screen.getByText('DESK-II // ASTROLABE')).toBeTruthy();
    expect(screen.getByText('DESK-III // AEGIS')).toBeTruthy();
    expect(screen.getByText('DESK-IV // SENTINEL')).toBeTruthy();
  });

  it('renders the desk alignment ledger from the independent opinions', () => {
    render(
      <SyndicateDossierCard
        agents={dissentingDesks()}
        opinions={dissentingDesks()}
        mode="full"
        symbol="XAUUSD"
      />,
    );

    fireEvent.click(screen.getByRole('tab', { name: /Alignment \(split\)/i }));

    expect(screen.getByText(/Desks disagree on direction/i)).toBeTruthy();
    expect(screen.getByText(/Real yields still restrictive/i)).toBeTruthy();
    expect(screen.getByText(/synthesizer weighs each desk equally/i)).toBeTruthy();
  });

  it('renders the Aegis Risk Guardrail when desks dissent', () => {
    const agents = dissentingDesks();
    render(<SyndicateDossierCard agents={agents} opinions={agents} mode="full" symbol="XAUUSD" />);
    expect(screen.getByText(/AEGIS RISK GUARDRAIL — DESKS DISSENT/i)).toBeTruthy();
    expect(screen.getByText(/0\.5% UNTIL DESKS RE-ALIGN/i)).toBeTruthy();
    expect(screen.getByText(/0\.5% Cap/i)).toBeTruthy();
    // Dissent is not a veto: the ticket stays GO/SELL rather than BLOCKED.
    expect(screen.queryByText(/RISK VETO ACTIVE/i)).toBeNull();
  });

  it('escalates to RISK VETO ACTIVE when AEGIS blocks the setup', () => {
    const agents: AgentProgress[] = [
      ...alignedDesks().slice(0, 2),
      {
        agentName: 'risk',
        status: 'done',
        opinion: {
          agentName: 'risk',
          bias: 'neutral',
          confidence: 0.35,
          reasoning: 'Volatility too elevated for a valid stop inside the 1% budget.',
        },
      },
    ];
    render(<SyndicateDossierCard agents={agents} opinions={agents} mode="full" symbol="XAUUSD" />);
    expect(screen.getByText(/SETUP BLOCKED BY RISK GUARDRAIL/i)).toBeTruthy();
    expect(screen.getByText(/RISK VETO ACTIVE/i)).toBeTruthy();
    expect(screen.getByText(/AEGIS · DESK-III · IMMUTABLE 1\.0% CEILING/i)).toBeTruthy();
  });

  it('collapses the desks/clashes into a War Room pill when compactInline is set', () => {
    render(
      <SyndicateDossierCard
        agents={alignedDesks()}
        opinions={alignedDesks()}
        mode="full"
        symbol="XAUUSD"
        compactInline
      />,
    );
    expect(screen.getByText(/open in War Room/i)).toBeTruthy();
    expect(screen.queryByText('Committee Conviction')).toBeNull();
    expect(screen.queryByText('DESK-I // HORUS')).toBeNull();
    // The certified ticket wells stay inline.
    expect(screen.getByText('ENTRY ZONE')).toBeTruthy();
  });
});

describe('MastraReportPart multi-agent routing (Locked Decision 4A)', () => {
  it('routes data-multi-agent-meta agentOpinions through the SyndicateDossierCard', () => {
    render(
      <MastraReportPart
        data={{
          mode: 'full',
          symbol: 'XAUUSD',
          agentOpinions: [
            {
              agentName: 'technical',
              bias: 'bullish',
              confidence: 0.94,
              reasoning: '15m swing low',
              rawData: {},
              model: 'claude-4-sonnet',
              latencyMs: 1200,
            },
          ],
        }}
      />,
    );

    expect(screen.getByText(/VERIFIED SYNDICATE DOSSIER · XAUUSD/i)).toBeTruthy();
    expect(screen.getByText('DESK-II // ASTROLABE')).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: /^Alignment$/i }));
    expect(screen.getByText(/All reporting desks agree on direction/i)).toBeTruthy();
  });
});
