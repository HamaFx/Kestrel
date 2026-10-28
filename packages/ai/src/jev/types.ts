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

// SPDX-License-Identifier: Apache-2.0

/**
 * Phase 1 (Jev System One) — shared types for `packages/ai/src/jev/`.
 *
 * Jev is a non-autoregressive *decision* model served over TypeSafe's
 * `POST /v1/systemone` JSON contract. One request carries many parallel
 * typed questions (`choice` / `score` / `noul`) and the response carries one
 * calibrated answer per question with a probability distribution — no
 * generative prefill/decode overhead.
 *
 * Security invariant: only sanitized user text and deterministic metadata may
 * ever be placed in `state`. Untrusted external prose (news / web / social)
 * is never sent to a routing / packet-scoring / tool-pruning Jev call.
 */

import type { ResolveModelEnv } from '../models/env-factory';

/**
 * Env subset the Jev client reads. Extends the shared model env so any caller
 * holding a `ResolveModelEnv` (or a full `ServerEnv` after `pickAiEnv`) can
 * pass it through without narrowing.
 */
export interface JevEnv extends ResolveModelEnv {
  /** OpenCode Console API key — serves `jev-1.13-free` at $0.00. */
  OPENCODE_API_KEY?: string | undefined;
  /** Direct TypeSafe AI key for `/v1/systemone` (`jev-latest`). */
  TYPESAFE_API_KEY?: string | undefined;
  /**
   * Liquid AI key for the d1 decision models
   * (`api.liquid.ai/decisions/v1/systemone`). Complex tasks resolve to
   * `d1-ultra` ($0.042/1M in) and simple tasks to `d1.1` ($0.02/1M in).
   */
  LIQUID_API_KEY?: string | undefined;
  /** Optional operator-configured endpoint override (OpenCode/TypeSafe). */
  JEV_BASE_URL?: string | undefined;
}

/** Structural settings shape accepted by the resolver (BYOK payload column). */
export interface JevSettings {
  aiApiKeys?: string | null | undefined;
}

/**
 * Decision-task complexity tier. Simple calls (short-text classification,
 * enumeration, pruning) resolve to Liquid's `d1.1`; complex calls (structured
 * judgement over a dense packet, consensus/debate reasoning, semantic
 * verification, evaluation rubrics) resolve to `d1-ultra`. Providers without
 * tiered models ignore it; the default is `complex` so quality-first is the
 * fallback when a call site does not declare a tier.
 */
export type JevTaskTier = 'complex' | 'simple';

/** Canonical Jev provider ids, in resolution priority order. */
export type JevProviderId =
  'opencode-free' | 'vercel-gateway' | 'liquid' | 'typesafe' | 'openrouter';

/** One resolved Jev endpoint (decrypted key + model + price). */
export interface ResolvedJevEndpoint {
  providerId: JevProviderId;
  endpointUrl: string;
  modelId: string;
  apiKey: string;
  /** USD per 1M input tokens. Output tokens are $0 on every Jev endpoint. */
  inputCostPerMTokUsd: number;
}

// ── Questions ──────────────────────────────────────────────────────────────

/** `choice` question — one label wins; probabilities are per-label. */
export interface JevChoiceQuestion {
  type: 'choice';
  instructions: string;
  criteria?: Record<string, string> | readonly string[];
}

/** `score` question — ordered criteria; probabilities are per level. */
export interface JevScoreQuestion {
  type: 'score';
  instructions: string;
  criteria?: readonly string[] | Record<string, string>;
}

/** `noul` question — a yes/no judgement with a calibrated probability. */
export interface JevNoulQuestion {
  type: 'noul';
  instructions: string;
  criteria?: never;
}

export type JevQuestion = JevChoiceQuestion | JevScoreQuestion | JevNoulQuestion;

// ── Answers ────────────────────────────────────────────────────────────────

export interface JevNoulAnswer {
  type: 'noul';
  value: boolean;
  /** Raw calibrated probability in [0, 1]. */
  probability: number;
  /** |2p − 1|. */
  confidence: number;
}

export interface JevChoiceAnswer {
  type: 'choice';
  choice: string;
  probabilities: Record<string, number>;
  confidence: number;
}

export interface JevScoreAnswer {
  type: 'score';
  /** Expected level index normalized to [0, 1]. */
  score: number;
  probabilities: number[];
  confidence: number;
}

export type JevAnswer = JevNoulAnswer | JevChoiceAnswer | JevScoreAnswer;

/** Maps a question type to the answer the client returns for it. */
export type JevAnswerFor<Q extends JevQuestion> = Q extends { type: 'noul' }
  ? JevNoulAnswer
  : Q extends { type: 'choice' }
    ? JevChoiceAnswer
    : JevScoreAnswer;

/** Typed answer map for a questions record. */
export type JevAnswersOf<Q extends Record<string, JevQuestion>> = {
  [K in keyof Q]: JevAnswerFor<Q[K]>;
};

export interface JevUsage {
  inputTokens: number;
  outputTokens: number;
}

/** Result of one `/v1/systemone` evaluation. */
export interface JevEvaluationResult<Q extends Record<string, JevQuestion>> {
  /** Model id echoed by the endpoint (or the resolved request id). */
  model: string;
  providerId: JevProviderId;
  answers: JevAnswersOf<Q>;
  usage: JevUsage;
  costUsd: number;
  latencyMs: number;
}

/** Minimal generation-ledger surface the client records cost into. */
export interface JevGenerationLedger {
  recordCost(id: string, kind: 'auxiliary', costUsd: number): boolean;
}
