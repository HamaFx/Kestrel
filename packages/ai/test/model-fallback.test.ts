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

// R14 — mid-turn provider failover: selection, bounding, breaker interaction,
// and exactly-once budget settlement across a fallback.

import { encryptByok } from '@kestrel/shared/encryption';
import type { LanguageModel } from 'ai';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { BudgetHandle } from '../src/budget';
import { defaultModelFor } from '../src/models/byok-providers';
import {
  MAX_TURN_FALLBACKS,
  resolveFallbackChain,
  runWithModelFallback,
  type ChatModelResolution,
  type FallbackModelCandidate,
} from '../src/models/model';
import { createGenerationLedger } from '../src/persistence/generation-ledger';
import { createExecutionLifecycle } from '../src/runtime/execution-lifecycle';

// Real BYOK encryption with a deterministic 32-byte key.
process.env.ENCRYPTION_SECRET = 'ab'.repeat(32);

const circuits = vi.hoisted(() => ({
  open: new Set<string>(),
  failures: [] as string[],
}));

vi.mock('../src/models/circuit-breaker', () => ({
  isCircuitOpen: (modelId: string) => circuits.open.has(modelId),
  recordModelFailure: (modelId: string) => {
    circuits.failures.push(modelId);
    return false;
  },
  recordModelSuccess: () => undefined,
}));

function candidate(modelId: string): FallbackModelCandidate {
  const slash = modelId.indexOf('/');
  return {
    providerId: modelId.slice(0, slash) as FallbackModelCandidate['providerId'],
    bareModelId: modelId.slice(slash + 1),
    modelId,
    model: { modelId } as unknown as LanguageModel,
  };
}

function resolution(modelId: string): ChatModelResolution {
  const c = candidate(modelId);
  return {
    ...c,
  };
}

const SETTINGS = {
  aiApiKeys: encryptByok({ google: 'google-test-key', anthropic: 'anthropic-test-key' }),
  chatModel: null,
  aiFallbackChain: null,
};

describe('resolveFallbackChain', () => {
  beforeEach(() => {
    circuits.open.clear();
    circuits.failures = [];
    // Operator env keys would leak into the chain; keep the test hermetic.
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;
  });

  it('offers the next configured providers, minus the primary', () => {
    const chain = resolveFallbackChain({
      settings: SETTINGS,
      env: {},
      domain: 'technical',
      primaryModelId: `google/${defaultModelFor('google', 'technical')}`,
    });

    expect(chain.map((c) => c.modelId)).toEqual([
      `anthropic/${defaultModelFor('anthropic', 'technical')}`,
    ]);
    expect(chain[0]?.providerId).toBe('anthropic');
  });

  it('skips models whose circuit is open', () => {
    const openModelId = `anthropic/${defaultModelFor('anthropic', 'technical')}`;
    circuits.open.add(openModelId);

    const chain = resolveFallbackChain({
      settings: SETTINGS,
      env: {},
      domain: 'technical',
      primaryModelId: `google/${defaultModelFor('google', 'technical')}`,
    });

    expect(chain).toEqual([]);
  });

  it('honors the user aiFallbackChain order over the default priority', () => {
    const chain = resolveFallbackChain({
      settings: {
        ...SETTINGS,
        aiFallbackChain: ['anthropic', 'google'],
      },
      env: {},
      domain: 'technical',
      primaryModelId: `google/${defaultModelFor('google', 'technical')}`,
    });

    expect(chain.map((c) => c.providerId)).toEqual(['anthropic']);
  });

  it('bounds the chain to the configured limit', () => {
    const chain = resolveFallbackChain({
      settings: SETTINGS,
      env: {},
      domain: 'technical',
      primaryModelId: `openai/${defaultModelFor('openai', 'technical') ?? 'gpt-4o'}`,
      limit: 1,
    });

    expect(chain).toHaveLength(1);
    expect(chain[0]?.providerId).toBe('google');
  });

  it('returns an empty chain when the user has no configured provider', () => {
    const chain = resolveFallbackChain({
      settings: { aiApiKeys: null, aiFallbackChain: null },
      env: {},
      domain: 'technical',
      primaryModelId: 'google/gemini-2.5-flash',
    });

    expect(chain).toEqual([]);
  });
});

describe('runWithModelFallback', () => {
  beforeEach(() => {
    circuits.open.clear();
    circuits.failures = [];
  });

  it('returns the primary result without any fallback part when it succeeds', async () => {
    const run = await runWithModelFallback({
      primary: resolution('google/primary'),
      candidates: [candidate('anthropic/alt')],
      attempt: async () => 'answer',
    });

    expect(run.result).toBe('answer');
    expect(run.resolution.modelId).toBe('google/primary');
    expect(run.fallbackParts).toEqual([]);
    expect(circuits.failures).toEqual([]);
  });

  it('continues on the next model after a classified 429 and records the failure', async () => {
    const attempted: string[] = [];
    const run = await runWithModelFallback({
      primary: resolution('google/primary'),
      candidates: [candidate('anthropic/alt')],
      attempt: async (model) => {
        attempted.push(model.modelId);
        if (model.modelId === 'google/primary') {
          throw Object.assign(new Error('rate limited'), { statusCode: 429 });
        }
        return 'fallback answer';
      },
    });

    expect(attempted).toEqual(['google/primary', 'anthropic/alt']);
    expect(run.result).toBe('fallback answer');
    expect(run.resolution.modelId).toBe('anthropic/alt');
    expect(run.fallbackParts).toHaveLength(1);
    expect(run.fallbackParts[0]).toMatchObject({
      type: 'data-fallback',
      reason: 'rate-limit',
      override: 'google/primary',
    });
    // The breaker learns about the failed provider.
    expect(circuits.failures).toEqual(['google/primary']);
  });

  it('falls over on a 5xx and keeps the failing attempt out of the result', async () => {
    const run = await runWithModelFallback({
      primary: resolution('google/primary'),
      candidates: [candidate('anthropic/alt')],
      attempt: async (model) => {
        if (model.modelId === 'google/primary')
          throw Object.assign(new Error('boom'), { statusCode: 503 });
        return model.modelId;
      },
    });

    expect(run.result).toBe('anthropic/alt');
    expect(run.fallbackParts[0]?.reason).toBe('upstream');
  });

  it('does not fall over on a hard 400', async () => {
    let attempts = 0;
    await expect(
      runWithModelFallback({
        primary: resolution('google/primary'),
        candidates: [candidate('anthropic/alt')],
        attempt: async () => {
          attempts += 1;
          throw Object.assign(new Error('bad request'), { statusCode: 400 });
        },
      }),
    ).rejects.toThrow('bad request');

    expect(attempts).toBe(1);
    expect(circuits.failures).toEqual([]);
  });

  it('never fails over after a user cancellation', async () => {
    const controller = new AbortController();
    let attempts = 0;
    const run = runWithModelFallback({
      primary: resolution('google/primary'),
      candidates: [candidate('anthropic/alt')],
      signal: controller.signal,
      attempt: async () => {
        attempts += 1;
        controller.abort(new DOMException('Aborted', 'AbortError'));
        throw Object.assign(new Error('rate limited'), { statusCode: 429 });
      },
    });

    await expect(run).rejects.toMatchObject({ statusCode: 429 });
    expect(attempts).toBe(1);
    expect(circuits.failures).toEqual([]);
  });

  it('bounds the number of model switches even when more candidates exist', async () => {
    const attempted: string[] = [];
    await expect(
      runWithModelFallback({
        primary: resolution('google/primary'),
        candidates: [candidate('anthropic/alt'), candidate('openai/alt2')],
        maxFallbacks: 1,
        attempt: async (model) => {
          attempted.push(model.modelId);
          throw Object.assign(new Error('upstream down'), { statusCode: 502 });
        },
      }),
    ).rejects.toMatchObject({ statusCode: 502 });

    expect(attempted).toEqual(['google/primary', 'anthropic/alt']);
    expect(attempted.length).toBeLessThanOrEqual(1 + MAX_TURN_FALLBACKS);
  });

  it('reports the model of every attempt so a terminal failure is attributed', async () => {
    const seen: string[] = [];
    await expect(
      runWithModelFallback({
        primary: resolution('google/primary'),
        candidates: [candidate('anthropic/alt')],
        onAttempt: (model) => {
          seen.push(model.modelId);
        },
        attempt: async (model) => {
          if (model.modelId === 'google/primary') {
            throw Object.assign(new Error('upstream down'), { statusCode: 502 });
          }
          throw Object.assign(new Error('also down'), { statusCode: 500 });
        },
      }),
    ).rejects.toMatchObject({ statusCode: 500 });

    expect(seen).toEqual(['google/primary', 'anthropic/alt']);
  });

  it('reconciles the turn reservation exactly once across a fallback', async () => {
    const reconcile = vi.fn(async () => undefined);
    const release = vi.fn(async () => undefined);
    const budget = {
      reservedUsd: 0.01,
      spent: 0,
      max: 5,
      released: false,
      reconcile,
      release,
    } as unknown as BudgetHandle;
    const lifecycle = createExecutionLifecycle(budget);
    const ledger = createGenerationLedger();

    const run = await runWithModelFallback({
      primary: resolution('google/primary'),
      candidates: [candidate('anthropic/alt')],
      attempt: async (model) => {
        if (model.modelId === 'google/primary') {
          throw Object.assign(new Error('rate limited'), { statusCode: 429 });
        }
        // Only the successful attempt books spend, under the stable turn key.
        ledger.recordCost('primary:run-1', 'primary', 0.02);
        return 'answer';
      },
    });

    expect(run.resolution.modelId).toBe('anthropic/alt');
    // The failed attempt never settles the budget mid-turn.
    expect(release).not.toHaveBeenCalled();
    expect(reconcile).not.toHaveBeenCalled();

    await lifecycle.complete(ledger.total());
    // A duplicate terminal callback (or a racing stream finalizer) settles once.
    await lifecycle.complete(0.99);
    expect(reconcile).toHaveBeenCalledTimes(1);
    expect(reconcile).toHaveBeenCalledWith(0.02);
  });

  it('deduplicates a retried attempt cost by its stable ledger key', () => {
    const ledger = createGenerationLedger();

    expect(ledger.recordCost('primary:run-1', 'primary', 0.07)).toBe(true);
    // A retry/fallback that re-records the same turn entry cannot double-book.
    expect(ledger.recordCost('primary:run-1', 'primary', 0.07)).toBe(false);
    expect(ledger.total()).toBeCloseTo(0.07, 10);
  });
});
