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

// Phase 3 (Jev roadmap) — JEPA-inspired market regime state composition
// (`memory_embeddings.kind = 'market_regime'`) and the Jev RLCD dataset export.

import { describe, expect, it, vi } from 'vitest';

import { buildJevRlcdTrainingRecords } from '../src/eval/training-export';
import type { PromptResult } from '../src/eval/types';
import type { SymbolResearchPacket } from '../src/mastra-v2/packets/symbol-research';
import {
  composeRegimeStateText,
  rememberMarketRegime,
} from '../src/memory/memory-index/remember-regime';

const { upsertMemoryMock } = vi.hoisted(() => ({
  upsertMemoryMock: vi.fn().mockResolvedValue({ stored: true }),
}));

vi.mock('../src/memory/memory-index/upsert', () => ({
  upsertMemory: upsertMemoryMock,
}));

describe('JEPA-inspired market regime state composition & Jev RLCD training export', () => {
  it('composes a deterministic latent regime descriptor from a SymbolResearchPacket', () => {
    const packet = {
      symbol: 'XAUUSD',
      dataQuality: 'complete',
      price: { tick: { mid: 2750 } },
      marketStructure: { recentSwingHigh: 2765, recentSwingLow: 2720, rangeSize: 45 },
      timeframes: [
        {
          timeframe: '1h',
          indicators: [
            { kind: 'rsi', values: [64.2] },
            { kind: 'atr', values: [12.5] },
          ],
        },
      ],
      xauusdExtension: {
        dollarIndex: [{ asOf: '2026-10-28', value: 103.8 }],
        realYields: [{ asOf: '2026-10-28', value: 1.95 }],
      },
    } as unknown as SymbolResearchPacket;

    const text = composeRegimeStateText(packet, {
      resolution4h: 'bullish',
      mfePct: 0.85,
      maePct: -0.15,
    });

    expect(text).toContain('REGIME[XAUUSD]');
    expect(text).toContain('1h:RSI=64.2,ATR=12.5');
    expect(text).toContain('DXY=103.8');
    expect(text).toContain('OUTCOME_4H=bullish(MFE=+0.85%,MAE=-0.15%)');
  });

  it('omits the outcome block when no forward outcome has resolved yet', () => {
    const packet = {
      symbol: 'XAUUSD',
      dataQuality: 'complete',
      price: { tick: { mid: 2750 } },
      marketStructure: { recentSwingHigh: 2765, recentSwingLow: 2720, rangeSize: 45 },
      timeframes: [],
    } as unknown as SymbolResearchPacket;

    const text = composeRegimeStateText(packet);
    expect(text).toContain('REGIME[XAUUSD]');
    expect(text).not.toContain('OUTCOME_4H');
  });

  it('builds Jev RLCD training records with sanitized state and calibrated target labels', () => {
    const records = buildJevRlcdTrainingRecords(
      [
        {
          id: 'case-1',
          prompt: 'Why is XAUUSD rising after FOMC?',
          text: 'XAUUSD rose as real yields fell.',
          ok: true,
          terminalStatus: 'completed',
          toolCalls: [{ name: 'get_price', args: {} }],
          assertions: [],
          citationScore: 1,
          ttftMs: 200,
          totalMs: 900,
          metadata: { totalCostUsd: 0.002 },
        } as unknown as PromptResult,
      ],
      {
        datasetVersion: '2026-10-28',
        includeAssistantText: true,
        approvedBy: 'hama',
      },
    );

    expect(records).toHaveLength(1);
    expect(records[0]!.schemaVersion).toBe('kestrel.jev-rlcd.v1');
    expect(records[0]!.questions.pass_quality.targetNoul).toBe(1);
    expect(records[0]!.questions.tools_used).toEqual(['get_price']);
    expect(records[0]!.state.prompt).toContain('XAUUSD');
    expect(records[0]!.state.assistantText).toContain('real yields fell');
  });

  it('refuses to export RLCD state containing credentials', () => {
    expect(() =>
      buildJevRlcdTrainingRecords(
        [
          {
            id: 'case-leak',
            prompt: 'My api key: sk-live-1234567890 — now analyse XAUUSD',
            text: '',
            ok: true,
            terminalStatus: 'completed',
            toolCalls: [],
            assertions: [],
            ttftMs: null,
            totalMs: 10,
            metadata: {},
          } as unknown as PromptResult,
        ],
        { datasetVersion: '2026-10-28' },
      ),
    ).toThrow(/sensitive content/);
  });

  it('refuses assistant text in an RLCD export without an approval identity', () => {
    expect(() =>
      buildJevRlcdTrainingRecords(
        [
          {
            id: 'case-2',
            prompt: 'XAUUSD structure?',
            text: 'Inside the range.',
            ok: true,
            terminalStatus: 'completed',
            toolCalls: [],
            assertions: [],
            ttftMs: null,
            totalMs: 10,
            metadata: {},
          } as unknown as PromptResult,
        ],
        { datasetVersion: '2026-10-28', includeAssistantText: true },
      ),
    ).toThrow(/approvedBy is required/);
  });

  it('labels an annotated failing turn with targetNoul 0', () => {
    const records = buildJevRlcdTrainingRecords(
      [
        {
          id: 'case-3',
          prompt: 'XAUUSD structure?',
          text: 'No levels given.',
          ok: true,
          terminalStatus: 'completed',
          toolCalls: [],
          assertions: [],
          ttftMs: null,
          totalMs: 10,
          metadata: {},
        } as unknown as PromptResult,
      ],
      {
        datasetVersion: '2026-10-28',
        annotations: { 'case-3': { label: 'fail', issueCodes: ['ungrounded'] } },
      },
    );

    expect(records[0]!.questions.pass_quality.targetNoul).toBe(0);
  });

  it('stores regime memories through the memory index with the market_regime kind', async () => {
    const packet = {
      packetId: 'packet-1',
      symbol: 'XAUUSD',
      generatedAt: '2026-10-28T12:00:00.000Z',
      dataQuality: 'complete',
      price: { tick: { mid: 2750 } },
      marketStructure: { recentSwingHigh: 2765, recentSwingLow: 2720, rangeSize: 45 },
      timeframes: [],
    } as unknown as SymbolResearchPacket;

    const result = await rememberMarketRegime({
      packet,
      userId: 'user-1',
      env: {},
      userSettings: { aiApiKeys: null, embeddingModel: null },
      outcome: { resolution4h: 'range' },
    });

    expect(result).toEqual({ stored: true });
    expect(upsertMemoryMock).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'market_regime',
        sourceId: 'packet-1',
        symbol: 'XAUUSD',
        userId: 'user-1',
      }),
    );
    const args = upsertMemoryMock.mock.calls[0]![0] as { text: string };
    expect(args.text).toContain('REGIME[XAUUSD]');
    expect(args.text).toContain('OUTCOME_4H=range');
  });
});
