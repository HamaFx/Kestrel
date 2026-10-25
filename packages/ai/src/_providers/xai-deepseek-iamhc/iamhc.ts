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

import { CAPS_FULL, CAPS_TEXT, defineProvider, openaiCompatibleFactory } from '../helpers';

export const IAMHC = defineProvider({
  id: 'iamhc',
  displayName: 'IAMHC API',
  familyName: 'Aggregate',
  keyHint: 'sk-…',
  description:
    'IAMHC — aggregated API proxy with 25+ models across OpenAI, Anthropic, Gemini, and more.',
  pricingTier: 'low',
  baseURL: 'https://api.iamhc.cn/v1',
  defaultModels: {
    fundamental: 'DeepSeek-V4-Pro',
    technical: 'DeepSeek-V4-Flash',
    summary: 'Qwen3.6-35B-A3B',
    vision: 'Qwen3.5-397B-A17B',
    embedding: null,
  },
  bestFor: 'Multi-model proxy',
  supports: { vision: true, embedding: false },
  models: [
    {
      modelId: 'auto',
      label: 'Auto (routed)',
      description: 'Smart routing across all models.',
      tier: 'flagship',
      capabilities: CAPS_TEXT,
    },
    {
      modelId: 'DeepSeek-V4-Pro',
      label: 'DeepSeek V4 Pro',
      description: 'Best reasoning model via proxy.',
      tier: 'flagship',
      capabilities: CAPS_TEXT,
    },
    {
      modelId: 'DeepSeek-V4-Flash',
      label: 'DeepSeek V4 Flash',
      description: 'Fast balanced model.',
      tier: 'pro',
      capabilities: CAPS_TEXT,
    },
    {
      modelId: 'Qwen3.5-397B-A17B',
      label: 'Qwen 3.5 397B (MoE)',
      description: 'Strong reasoning, vision-capable.',
      tier: 'flagship',
      capabilities: CAPS_FULL,
    },
    {
      modelId: 'Qwen3.6-35B-A3B',
      label: 'Qwen 3.6 35B (MoE)',
      description: 'Fast light reasoning.',
      tier: 'lite',
      capabilities: CAPS_TEXT,
    },
    {
      modelId: 'Kimi-K2.6',
      label: 'Kimi K2.6',
      description: 'Long context reasoning.',
      tier: 'pro',
      capabilities: CAPS_TEXT,
    },
    {
      modelId: 'MiniMax-M3',
      label: 'MiniMax M3',
      description: 'General purpose model.',
      tier: 'pro',
      capabilities: CAPS_TEXT,
    },
    {
      modelId: 'glm-4.7',
      label: 'GLM 4.7',
      description: 'ChatGLM series, Anthropic-compatible.',
      tier: 'pro',
      capabilities: CAPS_TEXT,
    },
  ],
  factory: openaiCompatibleFactory('iamhc', 'https://api.iamhc.cn/v1'),
});
