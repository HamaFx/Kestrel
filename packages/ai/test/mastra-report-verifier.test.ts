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

import { describe, expect, it } from 'vitest';

import {
  requireVerifiedXauusdReport,
  verifyXauusdReport,
} from '../src/mastra-v2/agents/xauusd/report/report-verifier';
import { XauusdResearchPacketSchema } from '../src/mastra-v2/packets/research-types';

const evidenceId = 'kestrel-price-xauusd-fixture';
const asOf = '2026-08-18T12:00:00.000Z';

function packet(status: 'ready' | 'blocked' = 'ready', warnings: string[] = []) {
  return XauusdResearchPacketSchema.parse({
    packetId: 'packet-1',
    kind: 'research_packet',
    symbol: 'XAUUSD',
    generatedAt: asOf,
    status,
    dataQuality: status === 'ready' ? 'partial' : 'degraded',
    timeframes: ['1d', '4h', '1h', '15m'],
    price: {
      evidenceId,
      kind: 'price',
      symbol: 'XAUUSD',
      source: 'fixture',
      fetchedAt: asOf,
      dataAsOf: asOf,
      freshness: 'fresh',
      quality: 'complete',
      warnings: [],
      data: {
        tick: {
          symbol: 'XAUUSD',
          bid: 2_345,
          ask: 2_345.2,
          mid: 2_345.1,
          ts: Date.parse(asOf),
          source: 'fixture',
        },
        stale: false,
        ageMs: 100,
      },
    },
    candles: [],
    indicators: [],
    macro: null,
    missingData: ['Macro context is unavailable'],
    warnings,
  });
}

function report(overrides: Record<string, unknown> = {}) {
  return {
    symbol: 'XAUUSD',
    asOf,
    dataQuality: 'partial',
    bias: 'neutral',
    confidence: 0.5,
    regime: 'range',
    bottomLine: 'Evidence is mixed.',
    technicalSummary: 'The technical packet is mixed.',
    fundamentalSummary: 'Macro context was not collected.',
    scenarios: [
      {
        name: 'Bullish continuation',
        direction: 'bullish',
        trigger: 'Price breaks and holds above resistance.',
        invalidation: 'Price closes back below the breakout level.',
        targets: ['next resistance'],
        risks: ['false breakout'],
        evidenceIds: [evidenceId],
      },
      {
        name: 'Bearish rejection',
        direction: 'bearish',
        trigger: 'Price rejects resistance.',
        invalidation: 'Price closes above resistance.',
        targets: ['next support'],
        risks: ['short squeeze'],
        evidenceIds: [evidenceId],
      },
    ],
    contradictions: ['Timeframes are not fully aligned.'],
    missingData: ['Macro context is unavailable'],
    numericClaims: [{ label: 'current mid price', value: 2_345.1, evidenceId }],
    evidenceIds: [evidenceId],
    sources: [{ evidenceId, source: 'fixture', dataAsOf: asOf }],
    ...overrides,
  };
}

describe('XAUUSD report verifier', () => {
  it('accepts a report whose quality and evidence match the packet', () => {
    const result = verifyXauusdReport(report(), packet());

    expect(result.ok).toBe(true);
    expect(result.report?.symbol).toBe('XAUUSD');
    expect(result.findings).toEqual([]);
  });

  it('rejects unknown evidence IDs and dishonest complete quality', () => {
    const result = verifyXauusdReport(
      report({
        dataQuality: 'complete',
        evidenceIds: ['unknown-evidence'],
      }),
      packet(),
    );

    expect(result.ok).toBe(false);
    expect(result.findings).toEqual(
      expect.arrayContaining([
        'report.evidenceIds references unknown evidence ID: unknown-evidence',
        'The report claims complete data quality despite degraded or partial evidence.',
      ]),
    );
  });

  it('rejects a report when the packet is blocked', () => {
    expect(() => requireVerifiedXauusdReport(report(), packet('blocked'))).toThrow(
      /failed deterministic verification/,
    );
  });

  it('rejects numeric claims that do not match the cited evidence', () => {
    const result = verifyXauusdReport(
      report({
        numericClaims: [{ label: 'invented price', value: 9_999, evidenceId }],
      }),
      packet(),
    );

    expect(result.ok).toBe(false);
    expect(result.findings).toContain(
      'report.numericClaims[0] is not supported by evidence kestrel-price-xauusd-fixture: invented price',
    );
  });

  it('rejects indicator configuration claims that are not observed values', () => {
    // Audit plan §1.6 (P0-6): the keyword-label exemption for parameter wording
    // is gone. An indicator period is configuration, not an observed market
    // value; the model is instructed to keep such numbers out of numericClaims,
    // and a claim that contains one now fails closed instead of being skipped
    // because its label mentions "EMA" or "RSI".
    const result = verifyXauusdReport(
      report({
        numericClaims: [
          { label: 'current mid price', value: 2_345.1, evidenceId },
          { label: 'EMA Period 20', value: 20, evidenceId },
        ],
      }),
      packet(),
    );

    expect(result.ok).toBe(false);
    expect(result.findings).toContain(
      'report.numericClaims[1] is not supported by evidence kestrel-price-xauusd-fixture: EMA Period 20',
    );
  });

  it('still rejects a fabricated price even when its label mentions a parameter', () => {
    const result = verifyXauusdReport(
      report({
        numericClaims: [{ label: 'EMA Period 20', value: 2_399.9, evidenceId }],
      }),
      packet(),
    );

    expect(result.ok).toBe(false);
    expect(result.findings).toContain(
      'report.numericClaims[0] is not supported by evidence kestrel-price-xauusd-fixture: EMA Period 20',
    );
  });

  it('allows supported numbers in narrative and structural timeframe notation', () => {
    const result = verifyXauusdReport(
      report({
        technicalSummary: 'The 1h EMA 20 is above the 4h EMA 50 near 2,345.1.',
        fundamentalSummary: 'The 10-year real-yield context is partial.',
      }),
      packet(),
    );

    expect(result.ok).toBe(true);
    expect(result.findings).toEqual([]);
  });

  it('accepts narrative numbers that appear directly in the evidence packet', () => {
    // The model quotes the ask price (2345.2) in prose without promoting it to
    // numericClaims. It is still grounded because the value is in the packet.
    const result = verifyXauusdReport(
      report({
        technicalSummary: 'Gold traded near 2,345.2 on the bid side of the quote.',
        numericClaims: [{ label: 'current mid price', value: 2_345.1, evidenceId }],
      }),
      packet(),
    );

    expect(result.ok).toBe(true);
    expect(result.findings).toEqual([]);
  });

  it('accepts a rounded indicator reading quoted in narrative', () => {
    // Packet RSI is 67.11; the model quotes "RSI near 67" in prose without a
    // numericClaim. Integer rounding of a real evidence value is grounded.
    const base = packet();
    const withIndicator = XauusdResearchPacketSchema.parse({
      ...base,
      indicators: [
        {
          evidenceId: 'indicators-rsi',
          kind: 'indicators',
          symbol: 'XAUUSD',
          timeframe: '1h',
          source: 'fixture',
          fetchedAt: asOf,
          dataAsOf: asOf,
          freshness: 'fresh',
          quality: 'complete',
          warnings: [],
          data: {
            candleCount: 50,
            stale: false,
            results: [
              {
                symbol: 'XAUUSD',
                tf: '1h',
                kind: 'rsi',
                params: { period: 14 },
                values: [67.11],
                fetchedAt: Date.parse(asOf),
              },
            ],
          },
        },
      ],
    });

    const result = verifyXauusdReport(
      report({
        technicalSummary: 'RSI is near 67 on the 1-hour chart.',
        contradictions: [],
      }),
      withIndicator,
    );

    expect(result.ok).toBe(true);
    expect(result.findings).toEqual([]);
  });

  it('rejects unsupported numbers introduced in narrative fields', () => {
    const result = verifyXauusdReport(
      report({
        technicalSummary: 'Price must reclaim 2,399.9 before the bullish idea is valid.',
      }),
      packet(),
    );

    expect(result.ok).toBe(false);
    expect(result.findings).toContain(
      'technicalSummary contains unsupported numeric value 2399.9; add it to numericClaims with supporting evidence.',
    );
  });
  it('accepts projected numbers in scenario levels as forward-looking and evidence-anchored', () => {
    const scenarios = report().scenarios.map((scenario, index) =>
      index === 0
        ? {
            ...scenario,
            trigger: 'A close above 2,400.5 confirms the setup.',
            entryZone: '2,398.0–2,402.0',
            targets: ['2,420.0'],
            invalidation: 'A close below 2,390.0 invalidates the idea.',
          }
        : scenario,
    );
    const result = verifyXauusdReport(report({ scenarios }), packet());

    expect(result.ok).toBe(true);
    expect(result.findings).toEqual([]);
  });

  it('rejects a fabricated target regardless of its label (audit plan 1.6, P0-6)', () => {
    // The required regression test: "Target 9999" used to skip verification
    // because the model-authored label matched the scenario-projection
    // keywords. Labels no longer exempt anything — with the default
    // 'observed' role the claim must match the cited evidence exactly.
    const result = verifyXauusdReport(
      report({
        numericClaims: [
          { label: 'current mid price', value: 2_345.1, evidenceId },
          { label: 'Target 9999', value: 9_999, evidenceId },
        ],
      }),
      packet(),
    );

    expect(result.ok).toBe(false);
    expect(result.findings).toContain(
      'report.numericClaims[1] is not supported by evidence kestrel-price-xauusd-fixture: Target 9999',
    );
  });

  it('rejects a fabricated projection even when the model marks it as one', () => {
    // The explicit role field replaces the label exemption: a projection is
    // exempt from the exact match only while it stays inside the ±25%
    // grounding band of the cited evidence values. 9,999 is over four times
    // the cited 2,345 price, so it is not plausibly derived from it.
    const result = verifyXauusdReport(
      report({
        numericClaims: [
          { label: 'current mid price', value: 2_345.1, evidenceId },
          { label: 'Target 9999', value: 9_999, evidenceId, role: 'projection' },
        ],
      }),
      packet(),
    );

    expect(result.ok).toBe(false);
    expect(result.findings).toContain(
      'report.numericClaims[1] projection is not plausibly derived from evidence kestrel-price-xauusd-fixture: Target 9999',
    );
  });

  it('accepts scenario projection claims anchored inside the evidence band', () => {
    // Projections the model derives from real evidence still pass: targets,
    // entry-zone edges, and invalidation levels within ±25% of the cited
    // price evidence, marked with the explicit projection role.
    const result = verifyXauusdReport(
      report({
        numericClaims: [
          { label: 'current mid price', value: 2_345.1, evidenceId },
          { label: 'Scenario 1 Target', value: 2_420, evidenceId, role: 'projection' },
          { label: 'Scenario 1 Entry Zone Low', value: 2_398, evidenceId, role: 'projection' },
          { label: 'Scenario 2 Invalidation', value: 2_390, evidenceId, role: 'projection' },
        ],
      }),
      packet(),
    );

    expect(result.ok).toBe(true);
    expect(result.findings).toEqual([]);
  });

  it('rejects scenario projection levels outside the cited evidence band', () => {
    // Scenario free-text numbers are no longer unchecked: a market-like
    // projection in trigger/entryZone/targets/invalidation must stay inside
    // the band of the scenario's own evidenceIds.
    const scenarios = report().scenarios.map((scenario, index) =>
      index === 0 ? { ...scenario, targets: ['9,999'] } : scenario,
    );
    const result = verifyXauusdReport(report({ scenarios }), packet());

    expect(result.ok).toBe(false);
    expect(result.findings).toContain(
      'scenarios[0].targets[0] contains projection value 9999 outside the grounding band of the referenced evidence ID values',
    );
  });

  it('accepts supported comma-formatted ranges and indicator notation', () => {
    const result = verifyXauusdReport(
      report({
        technicalSummary: 'The 20/50 EMA and MACD 12/26/9 remain mixed near 2,345.0–2,345.2.',
        numericClaims: [
          { label: 'bid', value: 2_345, evidenceId },
          { label: 'mid price', value: 2_345.1, evidenceId },
          { label: 'ask', value: 2_345.2, evidenceId },
        ],
      }),
      packet(),
    );

    expect(result.ok).toBe(true);
    expect(result.findings).toEqual([]);
  });

  it('rejects unsupported negative and percentage values in narrative', () => {
    const result = verifyXauusdReport(
      report({
        technicalSummary: 'The setup risks -1.5% if momentum fades.',
      }),
      packet(),
    );

    expect(result.ok).toBe(false);
    expect(result.findings).toContain(
      'technicalSummary contains unsupported numeric value -1.5; add it to numericClaims with supporting evidence.',
    );
  });

  it('rejects future timestamps and undisclosed stale evidence', () => {
    const result = verifyXauusdReport(
      report({ asOf: '2026-08-18T13:00:00.000Z' }),
      packet('ready', ['Price was served from stale-while-error cache']),
    );

    expect(result.ok).toBe(false);
    expect(result.findings).toEqual(
      expect.arrayContaining([
        'The report timestamp is later than the research packet by more than five seconds.',
        'The report did not disclose stale or outdated evidence.',
      ]),
    );
  });

  it('requires disclosure when timeframe EMA signals conflict', () => {
    const base = packet();
    const conflictPacket = XauusdResearchPacketSchema.parse({
      ...base,
      timeframes: ['1h', '4h'],
      indicators: [
        {
          evidenceId: 'indicators-1h',
          kind: 'indicators',
          symbol: 'XAUUSD',
          timeframe: '1h',
          source: 'fixture',
          fetchedAt: asOf,
          dataAsOf: asOf,
          freshness: 'fresh',
          quality: 'complete',
          warnings: [],
          data: {
            candleCount: 50,
            stale: false,
            results: [
              {
                symbol: 'XAUUSD',
                tf: '1h',
                kind: 'ema',
                params: { period: 20 },
                values: [101],
                fetchedAt: Date.parse(asOf),
              },
              {
                symbol: 'XAUUSD',
                tf: '1h',
                kind: 'ema',
                params: { period: 50 },
                values: [100],
                fetchedAt: Date.parse(asOf),
              },
            ],
          },
        },
        {
          evidenceId: 'indicators-4h',
          kind: 'indicators',
          symbol: 'XAUUSD',
          timeframe: '4h',
          source: 'fixture',
          fetchedAt: asOf,
          dataAsOf: asOf,
          freshness: 'fresh',
          quality: 'complete',
          warnings: [],
          data: {
            candleCount: 50,
            stale: false,
            results: [
              {
                symbol: 'XAUUSD',
                tf: '4h',
                kind: 'ema',
                params: { period: 20 },
                values: [99],
                fetchedAt: Date.parse(asOf),
              },
              {
                symbol: 'XAUUSD',
                tf: '4h',
                kind: 'ema',
                params: { period: 50 },
                values: [100],
                fetchedAt: Date.parse(asOf),
              },
            ],
          },
        },
      ],
    });

    const result = verifyXauusdReport(report({ contradictions: [] }), conflictPacket);

    expect(result.ok).toBe(false);
    expect(result.findings).toContain(
      'The report did not disclose a conflict between timeframe trend signals.',
    );
  });

  it('rejects reports without scenario risk or invalidation', () => {
    const result = verifyXauusdReport(
      report({
        scenarios: [
          { ...report().scenarios[0], invalidation: '', risks: [] },
          report().scenarios[1],
        ],
      }),
      packet(),
    );

    expect(result.ok).toBe(false);
    expect(result.findings).toEqual(
      expect.arrayContaining([
        'scenarios.0.invalidation: String must contain at least 1 character(s)',
      ]),
    );
  });
});
