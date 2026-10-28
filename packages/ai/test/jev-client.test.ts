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

// Phase 1 (§2) — the vendor-neutral Jev System One client. Covers the exact
// TypeSafe calibration formulas (choice concentration, score MAD, noul
// |2p-1|), the free-provider resolution order, and one POST /v1/systemone
// round trip over an injected fetch.

import { describe, expect, it, vi } from 'vitest';

import {
  computeChoiceConfidence,
  computeNoulConfidence,
  computeScoreConfidence,
  evaluateJev,
  resolveJevEndpoint,
} from '../src/jev';

describe('Jev calibration formulas & provider resolution', () => {
  it('computes exact TypeSafe/Wikipedia choice concentration confidence', () => {
    const res = computeChoiceConfidence({ fundamental: 0.85, technical: 0.1, summary: 0.05 });
    expect(res.choice).toBe('fundamental');
    // (0.85 - 1/3) / (1 - 1/3) = (0.516667) / (0.666667) = 0.775
    expect(res.confidence).toBeCloseTo(0.775, 3);
  });

  it('never divides by zero on a single-choice probability', () => {
    const res = computeChoiceConfidence({ only: 0.4 });
    expect(res.choice).toBe('only');
    expect(res.confidence).toBe(1);
  });

  it('computes score expected value and MAD confidence', () => {
    const res = computeScoreConfidence([0.0, 0.1, 0.9]);
    expect(res.score).toBeCloseTo((0 * 0 + 1 * 0.1 + 2 * 0.9) / 2, 3); // normalized [0, 1] = 0.95
    expect(res.confidence).toBeGreaterThan(0.8);
  });

  it('handles the n = 1 score edge case without NaN', () => {
    const res = computeScoreConfidence([0.8]);
    expect(Number.isFinite(res.score)).toBe(true);
    expect(Number.isFinite(res.confidence)).toBe(true);
  });

  it('computes noul boolean and confidence', () => {
    const res = computeNoulConfidence(0.95);
    expect(res.value).toBe(true);
    expect(res.confidence).toBeCloseTo(0.9, 3);
  });

  it('prioritizes OpenCode free jev-1.13-free over paid endpoints', () => {
    const resolved = resolveJevEndpoint(null, {
      OPENCODE_API_KEY: 'oc-123',
      AI_GATEWAY_API_KEY: 'vg-123',
      TYPESAFE_API_KEY: 'ts-123',
    });
    expect(resolved).toEqual({
      providerId: 'opencode-free',
      endpointUrl: 'https://opencode.ai/inference/systemone/v1/systemone',
      modelId: 'jev-1.13-free',
      apiKey: 'oc-123',
      inputCostPerMTokUsd: 0,
    });
  });

  it('falls back to Vercel AI Gateway typesafe-ai/jev when OPENCODE_API_KEY is absent', () => {
    const resolved = resolveJevEndpoint(null, {
      AI_GATEWAY_API_KEY: 'vg-123',
    });
    expect(resolved?.providerId).toBe('vercel-gateway');
    expect(resolved?.endpointUrl).toBe('https://ai-gateway.vercel.sh/typesafe/v1/systemone');
    expect(resolved?.modelId).toBe('typesafe-ai/jev');
  });

  it('falls back to direct TypeSafe AI before OpenRouter when both keys exist', () => {
    const resolved = resolveJevEndpoint({ aiApiKeys: null }, { TYPESAFE_API_KEY: 'ts-123' });
    expect(resolved?.providerId).toBe('typesafe');
    expect(resolved?.endpointUrl).toBe('https://api.typesafe.ai/v1/systemone');
    expect(resolved?.modelId).toBe('jev-latest');
    expect(resolved?.inputCostPerMTokUsd).toBe(0.042);
  });

  it('honours the operator JEV_BASE_URL override', () => {
    const resolved = resolveJevEndpoint(null, {
      OPENCODE_API_KEY: 'oc-123',
      JEV_BASE_URL: 'https://jev.internal.example/v1/systemone',
    });
    expect(resolved?.endpointUrl).toBe('https://jev.internal.example/v1/systemone');
  });

  it('returns null when no Jev provider is configured', () => {
    expect(resolveJevEndpoint(null, {})).toBeNull();
    expect(resolveJevEndpoint(null, {})).toBeNull();
  });

  it('executes POST /v1/systemone and parses parallel noul, choice, and score answers', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        model: 'jev-1.13.0',
        answers: {
          urgent: { type: 'noul', noul: 0.96 },
          domain: {
            type: 'choice',
            choice: 'fundamental',
            probabilities: { fundamental: 0.9, technical: 0.1 },
          },
          risk: {
            type: 'score',
            probabilities: [0.1, 0.2, 0.7],
          },
        },
        usage: { input_tokens: 200, output_tokens: 15 },
      }),
    });

    const result = await evaluateJev({
      state: 'CPI came in hot at 3.5%',
      questions: {
        urgent: { type: 'noul', instructions: 'Is this market-moving?' },
        domain: {
          type: 'choice',
          instructions: 'Pick domain',
          criteria: { fundamental: 'Macro', technical: 'Charts' },
        },
        risk: {
          type: 'score',
          instructions: 'Risk level',
          criteria: ['Low', 'Medium', 'High'],
        },
      },
      env: { OPENCODE_API_KEY: 'oc-test' },
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    expect(result).not.toBeNull();
    expect(result!.answers.urgent.value).toBe(true);
    expect(result!.answers.urgent.probability).toBe(0.96);
    expect(result!.answers.domain.choice).toBe('fundamental');
    expect(result!.answers.risk.score).toBeCloseTo(0.8, 2);
    expect(result!.costUsd).toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://opencode.ai/inference/systemone/v1/systemone');
    expect(init.method).toBe('POST');
    const body = JSON.parse(String(init.body)) as { model: string; state: string };
    expect(body.model).toBe('jev-1.13-free');
    expect(body.state).toBe('CPI came in hot at 3.5%');
  });

  it('returns null (never throws) when the endpoint is unreachable', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const result = await evaluateJev({
      state: 'hello',
      questions: { q: { type: 'noul', instructions: 'ok?' } },
      env: { OPENCODE_API_KEY: 'oc-test' },
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    expect(result).toBeNull();
  });

  it('returns null when no provider is configured (zero-key degradation)', async () => {
    const fetchMock = vi.fn();
    const result = await evaluateJev({
      state: 'hello',
      questions: { q: { type: 'noul', instructions: 'ok?' } },
      env: {},
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    expect(result).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('records the estimated cost into a generation ledger when supplied', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        model: 'jev-latest',
        answers: { q: { type: 'noul', noul: 0.9 } },
        usage: { input_tokens: 1_000_000, output_tokens: 10 },
      }),
    });
    const recordCost = vi.fn().mockReturnValue(true);
    const result = await evaluateJev({
      state: 'hello',
      questions: { q: { type: 'noul', instructions: 'ok?' } },
      env: { TYPESAFE_API_KEY: 'ts-key' },
      fetchImpl: fetchMock as unknown as typeof fetch,
      ledger: { recordCost },
      ledgerEntryId: 'run-1',
    });
    expect(result?.costUsd).toBeCloseTo(0.042, 6);
    expect(recordCost).toHaveBeenCalledTimes(1);
  });
});
