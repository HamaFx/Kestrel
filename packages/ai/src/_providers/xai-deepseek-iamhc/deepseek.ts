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

import { CAPS_TEXT, defineProvider, openaiCompatibleFactory } from '../helpers';

export const DEEPSEEK = defineProvider({
  id: 'deepseek',
  displayName: 'DeepSeek',
  familyName: 'DeepSeek',
  keyHint: 'sk-…',
  description: 'DeepSeek V4 — strong reasoning at very low cost (1M context).',
  pricingTier: 'low',
  docsUrl: 'https://api-docs.deepseek.com/quick_start/pricing',
  baseURL: 'https://api.deepseek.com',
  defaultModels: {
    fundamental: 'deepseek-v4-pro',
    technical: 'deepseek-v4-flash',
    summary: 'deepseek-v4-flash',
    vision: null,
    embedding: null,
  },
  bestFor: 'Cheap reasoning',
  supports: { vision: false, embedding: false },
  models: [
    {
      modelId: 'deepseek-v4-pro',
      label: 'DeepSeek V4 Pro',
      description: 'Best DeepSeek reasoning / agentic coding. 1M context.',
      tier: 'flagship',
      inputPerMTokUsd: 0.435,
      outputPerMTokUsd: 0.87,
      contextTokens: 1_000_000,
      capabilities: CAPS_TEXT,
      released: '2026-03',
    },
    {
      modelId: 'deepseek-v4-flash',
      label: 'DeepSeek V4 Flash',
      description: 'Fast/cheap V4 with optional thinking mode. 1M context.',
      tier: 'pro',
      inputPerMTokUsd: 0.14,
      outputPerMTokUsd: 0.28,
      contextTokens: 1_000_000,
      capabilities: CAPS_TEXT,
      released: '2026-03',
    },
    {
      modelId: 'deepseek-chat',
      label: 'DeepSeek Chat (alias → V4 Flash non-thinking)',
      description: 'Legacy alias. Prefer deepseek-v4-flash.',
      tier: 'fast',
      inputPerMTokUsd: 0.14,
      outputPerMTokUsd: 0.28,
      contextTokens: 1_000_000,
      capabilities: CAPS_TEXT,
      released: '2024-12',
    },
    {
      modelId: 'deepseek-reasoner',
      label: 'DeepSeek Reasoner (alias → V4 Flash thinking)',
      description: 'Legacy alias. Prefer deepseek-v4-flash (thinking mode).',
      tier: 'flagship',
      inputPerMTokUsd: 0.14,
      outputPerMTokUsd: 0.28,
      contextTokens: 1_000_000,
      capabilities: CAPS_TEXT,
      released: '2025-01',
    },
  ],
  factory: openaiCompatibleFactory('deepseek', 'https://api.deepseek.com'),
});
