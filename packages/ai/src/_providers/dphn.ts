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

import { CAPS_TEXT, defineProvider, openaiCompatibleFactory } from './helpers';

/**
 * Dolphin Inference Network.
 *
 * The public docs describe an OpenAI-compatible endpoint at
 * `https://lighthouse.dphn.ai/run/text-v/v1`. The only tool-capable model
 * exposed for this key is DeepSeek V4.1 Flash; `/models` also lists a Qwen
 * model, but the Dolphin quick-start documents DeepSeek as the supported
 * chat model, so the catalog intentionally stays narrow until the Qwen
 * endpoint has the same tool/streaming guarantees.
 */
export const DPHN = defineProvider({
  id: 'dphn',
  displayName: 'Dolphin API',
  familyName: 'DeepSeek',
  keyHint: 'dp-…',
  description:
    'Dolphin Inference Network — DeepSeek V4.1 Flash with tools and reasoning at $0.01 / $0.07 per Mtok.',
  pricingTier: 'low',
  docsUrl: 'https://dphn.ai/docs/coupon-credits/',
  baseURL: 'https://lighthouse.dphn.ai/run/text-v/v1',
  defaultModels: {
    fundamental: 'deepseek-ai/DeepSeek-V4.1-Flash',
    technical: 'deepseek-ai/DeepSeek-V4.1-Flash',
    summary: 'deepseek-ai/DeepSeek-V4.1-Flash',
    vision: null,
    embedding: null,
  },
  bestFor: 'Cheapest DeepSeek reasoning',
  supports: { vision: false, embedding: false },
  models: [
    {
      modelId: 'deepseek-ai/DeepSeek-V4.1-Flash',
      label: 'DeepSeek V4.1 Flash',
      description:
        'Dolphin-hosted DeepSeek V4.1 Flash — tool calling, reasoning output, 1M context.',
      tier: 'flagship',
      inputPerMTokUsd: 0.01,
      outputPerMTokUsd: 0.07,
      contextTokens: 1_048_576,
      capabilities: CAPS_TEXT,
      released: '2026-10',
    },
    {
      modelId: 'unsloth/Qwen3.8-27B-NVFP4',
      label: 'Qwen 3.8 27B (NVFP4)',
      description:
        'Dolphin-hosted Qwen 3.8 27B — fast structured outputs and tool calling for committee runs.',
      tier: 'pro',
      contextTokens: 262_144,
      capabilities: CAPS_TEXT,
      released: '2026-10',
    },
  ],
  factory: openaiCompatibleFactory(
    'dphn',
    'https://lighthouse.dphn.ai/run/text-v/v1',
    undefined,
    undefined,
    { supportsStructuredOutputs: true },
  ),
});
