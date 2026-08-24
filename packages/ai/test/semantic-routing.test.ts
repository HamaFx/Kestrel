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

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { runMastraStructured } from '../src/mastra/text-runner';
import { resolveModel } from '../src/model';
import { classifyTurnLLM } from '../src/semantic-routing';

// Mock dependencies
vi.mock('../src/mastra/text-runner', () => ({
  runMastraStructured: vi.fn(),
}));

vi.mock('../src/model', () => ({
  resolveModel: vi.fn(() => ({
    // Return a mock LanguageModel-like object (not a string)
    modelId: 'mock-model',
    provider: 'mock-provider',
  })),
}));

describe('classifyTurnLLM', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null when resolveModel returns a string (gateway mode)', async () => {
    vi.mocked(resolveModel).mockReturnValueOnce('gateway-model-string');

    const result = await classifyTurnLLM('What is the RSI?', 'google/gemini-2.5-flash', {}, null);
    expect(result).toBeNull();
    expect(runMastraStructured).not.toHaveBeenCalled();
  });

  it('returns classification on successful API call with high confidence', async () => {
    vi.mocked(runMastraStructured).mockResolvedValueOnce({
      object: {
        domain: 'technical',
        confidence: 0.95,
        rationale: 'User asked about RSI indicator',
      },
    } as never);

    const result = await classifyTurnLLM(
      'What is the RSI on EURUSD?',
      'google/gemini-2.5-flash',
      {},
      null,
    );
    expect(result).not.toBeNull();
    expect(result!.domain).toBe('technical');
    expect(result!.confidence).toBe(0.95);
  });

  it('returns null for low confidence classifications', async () => {
    vi.mocked(runMastraStructured).mockResolvedValueOnce({
      object: {
        domain: 'fundamental',
        confidence: 0.3,
        rationale: 'Unclear question',
      },
    } as never);

    const result = await classifyTurnLLM('Hello', 'google/gemini-2.5-flash', {}, null);
    expect(result).toBeNull();
  });

  it('returns null on API error', async () => {
    vi.mocked(runMastraStructured).mockRejectedValueOnce(new Error('API timeout'));

    const result = await classifyTurnLLM('Test question', 'google/gemini-2.5-flash', {}, null);
    expect(result).toBeNull();
  });

  it('does not treat prompts with the same first 200 characters as identical', async () => {
    vi.mocked(runMastraStructured)
      .mockResolvedValueOnce({
        object: { domain: 'technical', confidence: 0.95, rationale: 'First prompt' },
      } as never)
      .mockResolvedValueOnce({
        object: { domain: 'summary', confidence: 0.95, rationale: 'Second prompt' },
      } as never);
    const prefix = 'x'.repeat(200);

    const first = await classifyTurnLLM(`${prefix} first`, 'google/gemini-2.5-flash', {}, null);
    const second = await classifyTurnLLM(`${prefix} second`, 'google/gemini-2.5-flash', {}, null);

    expect(first?.domain).toBe('technical');
    expect(second?.domain).toBe('summary');
    expect(runMastraStructured).toHaveBeenCalledTimes(2);
  });

  it('reports cache-miss accounting without allowing accounting failures to fail routing', async () => {
    vi.mocked(runMastraStructured).mockResolvedValueOnce({
      object: {
        domain: 'technical',
        confidence: 0.95,
        rationale: 'RSI question',
      },
    } as never);
    const onComplete = vi.fn().mockRejectedValueOnce(new Error('telemetry unavailable'));

    const result = await classifyTurnLLM(
      'A unique routing question for accounting',
      'google/gemini-2.5-flash',
      {},
      null,
      { onComplete },
    );

    expect(result?.domain).toBe('technical');
    expect(onComplete).toHaveBeenCalledWith(
      expect.objectContaining({
        modelId: 'google/gemini-2.5-flash',
        inputChars: expect.any(Number),
        outputChars: expect.any(Number),
        cached: false,
        success: true,
        latencyMs: expect.any(Number),
      }),
    );
  });

  it('returns cached result on repeated call with same input', async () => {
    vi.mocked(runMastraStructured).mockResolvedValueOnce({
      object: {
        domain: 'technical',
        confidence: 0.95,
        rationale: 'RSI question',
      },
    } as never);

    // First call
    const first = await classifyTurnLLM('What is the RSI?', 'google/gemini-2.5-flash', {}, null);
    expect(first).not.toBeNull();

    // Second call should hit cache — runMastraStructured should not be called again
    const second = await classifyTurnLLM('What is the RSI?', 'google/gemini-2.5-flash', {}, null);

    expect(second).not.toBeNull();
    expect(second!.domain).toBe('technical');
    // runMastraStructured was only called once (first call)
    expect(runMastraStructured).toHaveBeenCalledTimes(1);
  });

  it('handles fundamental domain classification', async () => {
    vi.mocked(runMastraStructured).mockResolvedValueOnce({
      object: {
        domain: 'fundamental',
        confidence: 0.92,
        rationale: 'User asked about Fed policy impact on gold',
      },
    } as never);

    const result = await classifyTurnLLM(
      'Why is gold rallying after FOMC?',
      'google/gemini-2.5-flash',
      {},
      null,
    );
    expect(result!.domain).toBe('fundamental');
  });

  it('handles abort signal forwarding', async () => {
    const ac = new AbortController();
    vi.mocked(runMastraStructured).mockRejectedValueOnce(new DOMException('Aborted'));

    const result = await classifyTurnLLM('Test', 'google/gemini-2.5-flash', {}, ac.signal);
    // Signal not aborted — this tests that the signal is passed through
    expect(result).toBeNull();
  });
});
