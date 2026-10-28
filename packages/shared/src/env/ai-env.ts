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

// P3-11 — Canonical AI env subset for agent / planner / title / tool-context.

import type { ServerEnv } from '../env';

/**
 * P3-11 — Canonical AI env subset for agent / planner / title / tool-context.
 *
 * Extracted from the 5+ places where the same `{ AI_GATEWAY_API_KEY,
 * GOOGLE_*, AI_DEFAULT_MODEL, AI_EMBEDDING_MODEL, ... }` object was
 * hand-built. Returns the full canonical set.
 *
 * The parameter type is a mapped type over AiEnvKeys so callers can
 * pass `Pick<ServerEnv, AiEnvKeys>` (agent.ts) or the full `ServerEnv`
 * (route.ts, telegram/webhook.ts) — both are assignable.
 */
export type AiEnvKeys =
  | 'AI_GATEWAY_API_KEY'
  | 'GOOGLE_GENERATIVE_AI_API_KEY'
  | 'DPHN_API_KEY'
  | 'OPENCODE_API_KEY'
  | 'TYPESAFE_API_KEY'
  | 'LIQUID_API_KEY'
  | 'JEV_BASE_URL'
  | 'AI_DEFAULT_MODEL'
  | 'AI_TITLE_MODEL'
  | 'AI_EMBEDDING_MODEL'
  | 'MAX_DAILY_USD'
  | 'MAX_TOOL_ITERATIONS'
  | 'LOG_PROMPTS'
  | 'AI_SEMANTIC_ROUTING_ENABLED'
  | 'EXA_API_KEY'
  | 'TAVILY_API_KEY'
  | 'BRAVE_SEARCH_API_KEY'
  | 'WEB_SEARCH_ENABLED'
  | 'WEB_SEARCH_PROVIDER'
  | 'WEB_SEARCH_FALLBACK_PROVIDERS'
  | 'WEB_SEARCH_MAX_RESULTS'
  | 'WEB_SEARCH_MAX_CALLS_PER_TURN'
  | 'WEB_SEARCH_CACHE_TTL_SECONDS'
  | 'WEB_SEARCH_TIMEOUT_MS';

export function pickAiEnv(env: Pick<ServerEnv, AiEnvKeys>) {
  return {
    AI_GATEWAY_API_KEY: env.AI_GATEWAY_API_KEY,
    GOOGLE_GENERATIVE_AI_API_KEY: env.GOOGLE_GENERATIVE_AI_API_KEY,
    DPHN_API_KEY: env.DPHN_API_KEY,
    OPENCODE_API_KEY: env.OPENCODE_API_KEY,
    TYPESAFE_API_KEY: env.TYPESAFE_API_KEY,
    LIQUID_API_KEY: env.LIQUID_API_KEY,
    JEV_BASE_URL: env.JEV_BASE_URL,
    AI_DEFAULT_MODEL: env.AI_DEFAULT_MODEL,
    AI_TITLE_MODEL: env.AI_TITLE_MODEL,
    AI_EMBEDDING_MODEL: env.AI_EMBEDDING_MODEL,
    MAX_DAILY_USD: env.MAX_DAILY_USD,
    MAX_TOOL_ITERATIONS: env.MAX_TOOL_ITERATIONS,
    LOG_PROMPTS: env.LOG_PROMPTS,
    AI_SEMANTIC_ROUTING_ENABLED: env.AI_SEMANTIC_ROUTING_ENABLED,
    EXA_API_KEY: env.EXA_API_KEY,
    TAVILY_API_KEY: env.TAVILY_API_KEY,
    BRAVE_SEARCH_API_KEY: env.BRAVE_SEARCH_API_KEY,
    WEB_SEARCH_ENABLED: env.WEB_SEARCH_ENABLED,
    WEB_SEARCH_PROVIDER: env.WEB_SEARCH_PROVIDER,
    WEB_SEARCH_FALLBACK_PROVIDERS: env.WEB_SEARCH_FALLBACK_PROVIDERS,
    WEB_SEARCH_MAX_RESULTS: env.WEB_SEARCH_MAX_RESULTS,
    WEB_SEARCH_MAX_CALLS_PER_TURN: env.WEB_SEARCH_MAX_CALLS_PER_TURN,
    WEB_SEARCH_CACHE_TTL_SECONDS: env.WEB_SEARCH_CACHE_TTL_SECONDS,
    WEB_SEARCH_TIMEOUT_MS: env.WEB_SEARCH_TIMEOUT_MS,
  };
}
