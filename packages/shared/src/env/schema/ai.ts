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

// AI provider env. We support two transports:
//
//   1. Direct Google Gemini API:  set `GOOGLE_GENERATIVE_AI_API_KEY`. Pair
//                                 with a `google/...` model id. Free tier.
//   2. Vercel AI Gateway:         set `AI_GATEWAY_API_KEY`. Models routed by
//                                 prefixed id (e.g. `openai/gpt-4.1`).
//
// Model routing classifies user turns and picks the model from the matching
// env var below. All defaults stay safe — if you don't set the new vars,
// behaviour falls back to AI_DEFAULT_MODEL.
import { z } from 'zod';

export const AiEnv = z.object({
  AI_GATEWAY_API_KEY: z.string().min(1).optional(),
  GOOGLE_GENERATIVE_AI_API_KEY: z.string().min(1).optional(),
  /** Dolphin Inference Network key (OpenAI-compatible DeepSeek endpoint). */
  DPHN_API_KEY: z.string().min(1).optional(),
  /** OpenCode Console API key (serves jev-1.13-free at $0.00). */
  OPENCODE_API_KEY: z.string().min(1).optional(),
  /** Direct TypeSafe AI API key for /v1/systemone (jev-latest). */
  TYPESAFE_API_KEY: z.string().min(1).optional(),
  /** Optional operator-configured Jev System One endpoint override. */
  JEV_BASE_URL: z.string().url().optional(),
  AI_DEFAULT_MODEL: z.string().default('google/gemini-2.5-flash'),
  /**
   * Auto-title generator (first-turn thread title) and operator-set
   * fallback for the planner-style cheap model. Per-user picks come
   * from `user_settings.chat_model` + `derivePlannerModel` / `deriveTitleModel`.
   */
  AI_TITLE_MODEL: z.string().default('google/gemini-2.5-flash-lite'),
  AI_EMBEDDING_MODEL: z.string().default('openai/text-embedding-3-small'),
});

// NOTE: Self-hosters use BYOK (Bring Your Own Key) — users add their
// own AI provider keys via the in-app Settings → API Keys page after
// registration. The app boots without any server-level AI keys. When a user
// tries to chat without any keys configured, resolveChatModel() throws a
// clear error pointing them to Settings → API Keys.
//
// Server operators who want to provide a server-wide AI fallback can still set
// AI_GATEWAY_API_KEY or GOOGLE_GENERATIVE_AI_API_KEY.
