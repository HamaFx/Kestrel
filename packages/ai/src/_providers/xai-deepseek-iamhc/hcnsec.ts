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

import { CAPS_TEXT, defineProvider, hcnsecFetch, openaiCompatibleFactory } from '../helpers';

/**
 * HCNSEC is an OpenAI-compatible multi-model gateway. Its public guide
 * documents chat completions and streaming, but does not guarantee a
 * stable vision or embedding contract, so those capabilities stay off
 * until verified against the provider's live model catalogue.
 */
export const HCNSEC = defineProvider({
  id: 'hcnsec',
  displayName: 'HCNSEC API',
  familyName: 'Multi-model gateway',
  keyHint: 'sk-…',
  description:
    'HCNSEC — OpenAI-compatible gateway for DeepSeek, Qwen, GLM, Kimi, Gemini, and more.',
  pricingTier: 'free',
  docsUrl: 'https://hcnote.cn/2026/07/12/12831.html',
  baseURL: 'https://api.hcnsec.cn/v1',
  defaultModels: {
    // Live /v1/models verification on 2026-08-13 showed that the
    // canonical, tool-capable ID is case-sensitive. V4 Pro was listed
    // but returned 503 (no available channel), so Flash is the safe
    // default for both specialist analysis roles.
    fundamental: 'DeepSeek-V4-Flash',
    technical: 'DeepSeek-V4-Flash',
    summary: 'Qwen3.6-27B',
    vision: null,
    embedding: null,
  },
  bestFor: 'Free multi-model routing',
  supports: { vision: false, embedding: false },
  models: [
    {
      modelId: 'auto',
      label: 'Auto (routed)',
      description: 'HCNSEC smart routing across available models.',
      tier: 'flagship',
      capabilities: CAPS_TEXT,
    },
    {
      modelId: 'DeepSeek-V4-Flash',
      label: 'DeepSeek V4 Flash',
      description: 'Verified live on HCNSEC with chat and tool calling.',
      tier: 'pro',
      capabilities: CAPS_TEXT,
    },
    {
      modelId: 'DeepSeek-V4-Pro',
      label: 'DeepSeek V4 Pro',
      description:
        'Listed by HCNSEC, but currently returned no available channel during verification.',
      tier: 'flagship',
      capabilities: CAPS_TEXT,
    },
    {
      modelId: 'glm-5.2',
      label: 'GLM 5.2',
      description: 'GLM model currently listed by HCNSEC.',
      tier: 'pro',
      capabilities: CAPS_TEXT,
    },
    {
      modelId: 'kat-coder-pro-v2.5',
      label: 'Kat Coder Pro V2.5',
      description: 'Coding model currently listed by HCNSEC.',
      tier: 'pro',
      capabilities: CAPS_TEXT,
    },
    {
      modelId: 'Kimi-K2.6',
      label: 'Kimi K2.6',
      description: 'Kimi model currently listed by HCNSEC.',
      tier: 'pro',
      capabilities: CAPS_TEXT,
    },
    {
      modelId: 'MiniMax-M3',
      label: 'MiniMax M3',
      description: 'MiniMax model currently listed by HCNSEC.',
      tier: 'pro',
      capabilities: CAPS_TEXT,
    },
    {
      modelId: 'Qwen3.6-27B',
      label: 'Qwen 3.6 27B',
      description: 'General-purpose Qwen model currently listed by HCNSEC.',
      tier: 'pro',
      capabilities: CAPS_TEXT,
    },
    {
      modelId: 'sensenova-6.7-flash-lite',
      label: 'SenseNova 6.7 Flash Lite',
      description: 'Fast SenseNova model currently listed by HCNSEC.',
      tier: 'fast',
      capabilities: CAPS_TEXT,
    },
    {
      modelId: 'sensenova-u1-fast',
      label: 'SenseNova U1 Fast',
      description: 'Fast SenseNova model currently listed by HCNSEC.',
      tier: 'fast',
      capabilities: CAPS_TEXT,
    },
    {
      modelId: 'step-3.5-flash',
      label: 'Step 3.5 Flash',
      description: 'Fast Step model currently listed by HCNSEC.',
      tier: 'fast',
      capabilities: CAPS_TEXT,
    },
    {
      modelId: 'step-3.5-flash-2603',
      label: 'Step 3.5 Flash 2603',
      description: 'Step model currently listed by HCNSEC.',
      tier: 'fast',
      capabilities: CAPS_TEXT,
    },
    {
      modelId: 'step-3.7-flash',
      label: 'Step 3.7 Flash',
      description: 'Step model currently listed by HCNSEC.',
      tier: 'pro',
      capabilities: CAPS_TEXT,
    },
    {
      modelId: 'step-explore',
      label: 'Step Explore',
      description: 'Step exploration model currently listed by HCNSEC.',
      tier: 'pro',
      capabilities: CAPS_TEXT,
    },
  ],
  factory: openaiCompatibleFactory('hcnsec', 'https://api.hcnsec.cn/v1', undefined, hcnsecFetch),
});
