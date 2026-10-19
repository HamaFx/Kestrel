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

import { BYOK_PROVIDERS_LIST } from '../src/byok-providers';
import { estimateKnownCostUsd, resolveModelRate } from '../src/cost';
import {
  creditsForTurn,
  estimateCreditsForTurn,
  estimateCreditsForTokens,
  fullModeCreditEstimate,
  usdToCredits,
} from '../src/credits';

describe('credit conversion (plan §6.1)', () => {
  it('uses 1000 credits per dollar and rounds up', () => {
    expect(usdToCredits(0.0345)).toBe(35);
    expect(usdToCredits(0.0001)).toBe(1);
    expect(usdToCredits(0)).toBe(0);
    expect(usdToCredits(-1)).toBe(0);
  });

  it('charges BYOK turns the platform fee (0 by default)', () => {
    expect(
      creditsForTurn({
        providerMode: 'byok',
        modelId: 'anthropic/claude-sonnet-5',
        inputTokens: 5_000,
        outputTokens: 1_500,
      }),
    ).toBe(0);
  });

  it('matches estimateKnownCostUsd × 1000 ceil for every catalog model', () => {
    // Every provider's flagship model must round-trip through the shared
    // rate table; no second pricing source.
    let checked = 0;
    for (const provider of BYOK_PROVIDERS_LIST) {
      const model = provider.models.find((candidate) =>
        resolveModelRate(`${provider.id}/${candidate.modelId}`),
      );
      if (!model) continue;
      const qualified = `${provider.id}/${model.modelId}`;
      const usd = estimateKnownCostUsd(qualified, 4_000, 1_500);
      expect(
        creditsForTurn({
          providerMode: 'managed',
          modelId: qualified,
          inputTokens: 4_000,
          outputTokens: 1_500,
        }),
      ).toBe(Math.ceil(usd * 1000));
      checked += 1;
    }
    expect(checked).toBeGreaterThan(5);
  });

  it('reserves a model-aware single-turn estimate and the configured full estimate', () => {
    const single = estimateCreditsForTurn({
      mode: 'single',
      providerMode: 'managed',
      modelId: 'anthropic/claude-sonnet-5',
    });
    // 5k in × $3 + 1.5k out × $15 = $0.0375, +20% buffer → 45 credits.
    expect(single).toBe(45);
    expect(
      estimateCreditsForTurn({ mode: 'full', providerMode: 'managed', modelId: null }),
    ).toBe(fullModeCreditEstimate());
  });

  it('non-throwing token estimate is still integer credits', () => {
    const value = estimateCreditsForTokens('managed', 'unknown/model', 1_000, 1_000);
    expect(Number.isInteger(value)).toBe(true);
    expect(value).toBeGreaterThan(0);
  });
});
