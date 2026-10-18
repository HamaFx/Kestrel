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

// C-01 (audit 2026-10-18, B-05) — committee prompts must disclose whether the
// optional macro/fundamental extension was attached per symbol, so a
// non-XAUUSD desk read can never imply macro context was checked.

import { RequestContext } from '@mastra/core/request-context';
import { describe, expect, it } from 'vitest';

import {
  comparisonFusionInstructionsForRequest,
  fusionInstructionsForRequest,
  specialistInstructionsForRequest,
} from '../src/committee/prompts';
import type { ModeRequestContext } from '../src/committee/types';
import type { SymbolResearchPacket } from '../src/mastra-v2/packets/symbol-research';

function packet(
  symbol: string,
  optionalContext: { available: boolean; reason: string },
): SymbolResearchPacket {
  return {
    packetId: `packet-${symbol}`,
    kind: 'symbol_research_packet',
    symbol,
    generatedAt: '2026-10-18T12:00:00.000Z',
    status: 'ready',
    dataQuality: 'complete',
    price: null,
    timeframes: [],
    optionalContext,
    missingData: [],
    warnings: [],
  } as unknown as SymbolResearchPacket;
}

function context(entries: Array<[string, unknown]>): RequestContext<ModeRequestContext> {
  return new RequestContext<ModeRequestContext>(entries as never);
}

const NO_MACRO = {
  available: false,
  reason:
    'Fundamental context is not part of the generalized EURUSD packet; use the XAUUSD fundamental workflow where applicable.',
};
const WITH_MACRO = {
  available: true,
  reason: 'XAUUSD macro context (dollar index, real yields, USD events, news) is attached.',
};

describe('committee optional-context disclosure (C-01 / B-05)', () => {
  it('states the macro extension is unavailable in per-desk prompts', () => {
    const prompt = specialistInstructionsForRequest({
      name: 'fundamental',
      requestContext: context([['packet', packet('EURUSD', NO_MACRO)]]),
    });

    expect(prompt).toContain('OPTIONAL CONTEXT: unavailable');
    expect(prompt).toContain('is not part of the generalized EURUSD packet');
    // The desk is explicitly told not to imply the check happened.
    expect(prompt).toContain('never imply it was');
  });

  it('states the macro extension is attached for XAUUSD prompts', () => {
    const prompt = specialistInstructionsForRequest({
      name: 'technical',
      requestContext: context([['packet', packet('XAUUSD', WITH_MACRO)]]),
    });

    expect(prompt).toContain('OPTIONAL CONTEXT: attached');
    expect(prompt).toContain('dollar index, real yields');
    expect(prompt).not.toContain('OPTIONAL CONTEXT: unavailable');
  });

  it('discloses optional context to the fusion synthesizer', () => {
    const prompt = fusionInstructionsForRequest({
      requestContext: context([
        ['packet', packet('EURUSD', NO_MACRO)],
        ['opinions', []],
      ]),
    });

    expect(prompt).toContain('OPTIONAL CONTEXT: unavailable');
    expect(prompt).toContain('is not part of the generalized EURUSD packet');
  });

  it('discloses optional context per symbol in comparison fusion', () => {
    const prompt = comparisonFusionInstructionsForRequest({
      requestContext: context([
        [
          'packets',
          {
            EURUSD: packet('EURUSD', NO_MACRO),
            XAUUSD: packet('XAUUSD', WITH_MACRO),
          },
        ],
        ['opinions', []],
      ]),
    });

    expect(prompt).toContain('EURUSD');
    expect(prompt).toContain('XAUUSD');
    expect(prompt).toContain('OPTIONAL CONTEXT: unavailable');
    expect(prompt).toContain('OPTIONAL CONTEXT: attached');
  });
});
