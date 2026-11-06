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

import { CAPS_FULL, defineProvider, openaiCompatibleFactory } from '../helpers';

export const XAI = defineProvider({
  id: 'xai',
  displayName: 'xAI (Grok)',
  familyName: 'Grok',
  keyHint: 'xai-…',
  description: 'Grok 4.5 / 4.3 — strong reasoning, tools, vision, large context.',
  pricingTier: 'medium',
  docsUrl: 'https://docs.x.ai/developers/models',
  baseURL: 'https://api.x.ai/v1',
  defaultModels: {
    fundamental: 'grok-4.5',
    technical: 'grok-4.3',
    summary: 'grok-4.3',
    vision: 'grok-4.5',
    embedding: null,
  },
  bestFor: 'Agentic tools + search',
  supports: { vision: true, embedding: false },
  models: [
    {
      modelId: 'grok-4.5',
      label: 'Grok 4.5',
      description: 'Flagship Grok for code + agents. 500k context.',
      tier: 'flagship',
      inputPerMTokUsd: 2,
      outputPerMTokUsd: 6,
      contextTokens: 500_000,
      capabilities: CAPS_FULL,
      released: '2026-06',
    },
    {
      modelId: 'grok-4.3',
      label: 'Grok 4.3',
      description: 'Balanced Grok chat model. 1M context.',
      tier: 'pro',
      inputPerMTokUsd: 1.25,
      outputPerMTokUsd: 2.5,
      contextTokens: 1_000_000,
      capabilities: CAPS_FULL,
      released: '2026-05',
    },
    {
      modelId: 'grok-4.20-0309-reasoning',
      label: 'Grok 4.20 Reasoning',
      description: 'Reasoning-tuned Grok 4.20 snapshot.',
      tier: 'pro',
      inputPerMTokUsd: 1.25,
      outputPerMTokUsd: 2.5,
      contextTokens: 1_000_000,
      capabilities: CAPS_FULL,
      released: '2026-03',
    },
    {
      modelId: 'grok-4.20-0309-non-reasoning',
      label: 'Grok 4.20 Fast',
      description: 'Non-reasoning / lower-latency Grok 4.20.',
      tier: 'fast',
      inputPerMTokUsd: 1.25,
      outputPerMTokUsd: 2.5,
      contextTokens: 1_000_000,
      capabilities: CAPS_FULL,
      released: '2026-03',
    },
  ],
  factory: openaiCompatibleFactory('xai', 'https://api.x.ai/v1'),
});
