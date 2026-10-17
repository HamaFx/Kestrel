import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RequestContext } from '@mastra/core/request-context';

import type * as SymbolResearchModule from '../src/mastra-v2/packets/symbol-research';

// Audit plan §2.3 — the packet string must be serialized once per packet
// object and reused across every desk and retry in the run. Spy on the
// serializer through the same module specifier prompts.ts imports.
vi.mock('../src/mastra-v2/packets/symbol-research', async (importOriginal) => {
  const actual = await importOriginal<typeof SymbolResearchModule>();
  return {
    ...actual,
    serializeSymbolResearchPacket: vi.fn(actual.serializeSymbolResearchPacket),
  };
});

import { serializeSymbolResearchPacket } from '../src/mastra-v2/packets/symbol-research';
import { specialistInstructionsForRequest } from '../src/committee/prompts';
import type { ModeRequestContext } from '../src/committee/types';
import type { SymbolResearchPacket } from '../src/mastra-v2/packets/symbol-research';

function contextWith(entries: Array<[string, unknown]>): RequestContext<ModeRequestContext> {
  return new RequestContext(entries as never) as RequestContext<ModeRequestContext>;
}

function makePacket(symbol: string, price: number): SymbolResearchPacket {
  return {
    packetId: `packet-${symbol}`,
    kind: 'symbol_research_packet',
    symbol,
    generatedAt: new Date().toISOString(),
    status: 'ready',
    price: { price, change: 0.5, changePercent: 0.02, currency: 'USD' },
    timeframes: [],
    indicators: [],
    news: [],
    events: [],
    cot: null,
    sentiment: null,
    correlations: [],
    warnings: [],
  } as unknown as SymbolResearchPacket;
}

const serializeMock = vi.mocked(serializeSymbolResearchPacket);

beforeEach(() => {
  serializeMock.mockClear();
});

describe('packet single-serialization (audit plan §2.3)', () => {
  it('serializes one packet object once across repeated instructions builds (retries)', () => {
    const packet = makePacket('XAUUSD', 2650.4);
    const context = contextWith([['packet', packet]]);
    const first = specialistInstructionsForRequest({ name: 'technical', requestContext: context });
    // Simulated retry / second desk / repair round: same packet object.
    const second = specialistInstructionsForRequest({ name: 'risk', requestContext: context });
    const third = specialistInstructionsForRequest({ name: 'technical', requestContext: context });

    expect(serializeMock).toHaveBeenCalledTimes(1);
    expect(first).toContain('PACKET:');
    expect(second).toContain('PACKET:');
    expect(third).toContain('PACKET:');
  });

  it('re-serializes only when the packet object identity changes', () => {
    const first = makePacket('XAUUSD', 2650.4);
    const clone = makePacket('XAUUSD', 2650.4); // structurally equal, new object
    const firstContext = contextWith([['packet', first]]);
    const cloneContext = contextWith([['packet', clone]]);

    specialistInstructionsForRequest({ name: 'technical', requestContext: firstContext });
    specialistInstructionsForRequest({ name: 'technical', requestContext: cloneContext });

    expect(serializeMock).toHaveBeenCalledTimes(2);
  });

  it('falls back to static instructions when the context carries no packet', () => {
    const instructions = specialistInstructionsForRequest({
      name: 'technical',
      requestContext: contextWith([]),
    });
    expect(instructions).not.toContain('PACKET:');
    expect(serializeMock).not.toHaveBeenCalled();
  });
});
