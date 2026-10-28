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

// Phase 3 (Jev roadmap) — `agent_opinions` persistence records the run symbol
// in `raw_data.symbol` (so the calibration job can resolve candles) and the
// best-effort wrapper never fails a durable turn.

import type * as KestrelDb from '@kestrel/db';
import { container } from '@kestrel/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { saveAgentOpinions, saveAgentOpinionsBestEffort } from '../src/multi-agent/persistence';
import { DB } from '../src/runtime/tokens';

const { state, dbStub } = vi.hoisted(() => {
  const state = {
    rows: [] as Array<Record<string, unknown>>,
    parentFound: true,
    insertFails: false,
  };
  const dbStub = {
    select: () => ({
      from: () => ({
        innerJoin: () => ({
          where: () => ({
            limit: async () =>
              state.parentFound ? [{ threadId: 'thread-1', messageId: 'message-1' }] : [],
          }),
        }),
      }),
    }),
    insert: () => ({
      values: (rows: Array<Record<string, unknown>>) => {
        state.rows = rows;
        return {
          onConflictDoNothing: async () => {
            if (state.insertFails) throw new Error('insert failed');
          },
        };
      },
    }),
  };
  return { state, dbStub };
});

vi.mock('@kestrel/db', async (importOriginal) => {
  const actual = await importOriginal<typeof KestrelDb>();
  return { ...actual, requireTenantIdForUser: vi.fn(async () => 'tenant-1') };
});

vi.mock('../src/persistence/outbox', () => ({
  enqueuePersistenceFailure: vi.fn(async () => undefined),
}));

function opinion(rawData: Record<string, unknown>): {
  agentName: string;
  bias: string;
  confidence: number;
  reasoning: string;
  rawData: Record<string, unknown>;
  model: string;
  costUsd: number;
  latencyMs: number;
} {
  return {
    agentName: 'technical',
    bias: 'bullish',
    confidence: 0.8,
    reasoning: 'Structure favors upside continuation.',
    rawData,
    model: 'google/gemini-2.5-pro',
    costUsd: 0.002,
    latencyMs: 900,
  };
}

beforeEach(() => {
  state.rows = [];
  state.parentFound = true;
  state.insertFails = false;
  container.register(DB, () => dbStub as never);
});

describe('agent opinion persistence', () => {
  it('records the run symbol inside raw_data when the opinion does not carry one', async () => {
    await saveAgentOpinions({
      userId: 'user-1',
      threadId: 'thread-1',
      messageId: 'message-1',
      analysisMode: 'full',
      symbol: 'XAUUSD',
      opinions: [opinion({ keyLevels: [] })],
    });

    expect(state.rows).toHaveLength(1);
    expect(state.rows[0]!.rawData).toMatchObject({ symbol: 'XAUUSD' });
  });

  it('never clobbers a symbol already present in the opinion payload', async () => {
    await saveAgentOpinions({
      userId: 'user-1',
      threadId: 'thread-1',
      messageId: 'message-1',
      analysisMode: 'full',
      symbol: 'XAUUSD',
      opinions: [opinion({ symbol: 'EURUSD' })],
    });

    expect(state.rows[0]!.rawData).toMatchObject({ symbol: 'EURUSD' });
  });

  it('best-effort wrapper swallows write failures so a durable turn never fails', async () => {
    state.insertFails = true;

    const ok = await saveAgentOpinionsBestEffort({
      userId: 'user-1',
      threadId: 'thread-1',
      messageId: 'message-1',
      analysisMode: 'full',
      symbol: 'XAUUSD',
      opinions: [opinion({})],
    });

    expect(ok).toBe(false);
  });

  it('best-effort wrapper reports success on a clean write', async () => {
    const ok = await saveAgentOpinionsBestEffort({
      userId: 'user-1',
      threadId: 'thread-1',
      messageId: 'message-1',
      analysisMode: 'single',
      symbol: 'XAUUSD',
      opinions: [opinion({})],
    });

    expect(ok).toBe(true);
    expect(state.rows[0]!.analysisMode).toBe('single');
  });
});
