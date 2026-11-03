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

// JEPA-inspired market regime state composition
// (`memory_embeddings.kind = 'market_regime'`).

import { describe, expect, it, vi } from 'vitest';

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

describe('JEPA-inspired market regime state composition', () => {
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
