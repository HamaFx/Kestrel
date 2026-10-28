/*
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
 * Unified router (audit plan §1.1, P0-3). One auditable decision object for
 * every chat turn: domain classification, symbol extraction, injection
 * classification, mutation intent, capability, route, and model purpose all
 * resolve in a single pass so no boundary re-classifies with drifted regexes.
 *
 * All lexical patterns come from `../routing-keywords.ts` (single source).
 * `createExecutionPlan` delegates here via `decideMastraExecution` and both
 * share one `RoutingDecision`, so the plan boundary can never disagree with
 * the safety gates.
 */

import type { UIMessage } from 'ai';

import { evaluateJevTurnRouting, type JevTurnRoutingDecision } from '../../jev/turn-router';
import type { ResolveModelEnv } from '../../models/env-factory';
import type { MastraModelPurpose } from '../../models/model';
import type { RoutingDecision, RoutingDomain } from '../../routing';
import { isHighConfidenceMutationIntent } from '../../routing/keywords';
import { classifyMutationRequestWithJev } from '../mutation/mutation-detect';
import {
  decideMastraExecution,
  type MastraExecutionDecision,
  type MastraExecutionDecisionInput,
  type MastraExecutionRoute,
} from './execution-decision';
import { isInjectionAttempt, messageText } from './routing-policy';

/** Mutation kinds the model-based classifier can detect. */
export type UnifiedMutationKind = NonNullable<ReturnType<typeof classifyMutationRequestWithJev>>;

export interface UnifiedRoutingDecision {
  /** Semantic/keyword domain from `routeTurn`. */
  domain: RoutingDomain;
  planRequired: boolean;
  /** One canonical symbol, or null for symbol-free prompts. */
  symbol: string | null;
  /** XAUUSD report path classification, when applicable. */
  xauusdChatKind: 'research' | 'conversation' | null;
  /** Lexical injection gate (always blocks; zero-cost first line). */
  injection: { blocked: boolean; reason?: string };
  /** Model-based mutation classification, when mutations are enabled. */
  mutationKind: UnifiedMutationKind | null;
  /** High-confidence lexical mutation gate (chat-boundary 422). */
  highConfidenceMutationIntent: boolean;
  /** Capability id selected for this turn (manifest key), if any. */
  capabilityId: string | null;
  /** Route selected for this turn. */
  route: MastraExecutionRoute;
  modelPurpose: MastraModelPurpose | null;
  rationale: string;
  /** The underlying decision object the execution plan is built from. */
  decision: MastraExecutionDecision;
  routing: RoutingDecision;
}

export interface UnifiedRouterInput extends MastraExecutionDecisionInput {
  userMessage: UIMessage;
  env: ResolveModelEnv;
  /**
   * Lexical mutation gate is always evaluated; the model-based classifier is
   * the caller's policy choice (it runs only when the mutation capability is
   * enabled), so the unified router accepts the result rather than re-running
   * the LLM call twice.
   */
  classifiedMutationKind?: UnifiedMutationKind | null;
  /**
   * Phase 1 (Jev) — a pre-computed turn-routing decision. Callers that
   * already evaluated the parallel Jev request pass it here; when omitted the
   * router evaluates it once itself.
   */
  jevDecision?: JevTurnRoutingDecision | null;
}

/**
 * Route one chat turn through every classification layer exactly once.
 * Injection and mutation classification run before any capability/model work
 * so the boundary can 422 cheaply; the heavy `decideMastraExecution` pass
 * (semantic routing + capability + model resolution) runs once and is embedded
 * in the result for the execution plan.
 *
 * Phase 1 (Jev): one parallel `/v1/systemone` evaluation resolves domain,
 * XAUUSD chat kind, report follow-up, mutation intent, and injection risk.
 * The deterministic lexical gates still run and are OR-ed with the Jev
 * verdicts, so a Jev call can only ever tighten the read-only boundary —
 * never weaken it. With no Jev provider configured the network call is
 * skipped and the previous regex/keyword behavior is preserved.
 */
export async function routeUnified(input: UnifiedRouterInput): Promise<UnifiedRoutingDecision> {
  const promptText = messageText(input.userMessage);

  const jevDecision =
    input.jevDecision !== undefined
      ? input.jevDecision
      : await evaluateJevTurnRouting({
          userText: promptText,
          priorReportAvailable: input.priorReportAvailable === true,
          settings: input.settings,
          env: input.env,
          signal: input.signal ?? null,
        });

  // Zero-cost safety gates first — no model should ever see an injection
  // attempt, and high-confidence trade commands are rejected before routing.
  // Jev can only add a block on top of the zero-cost verdicts.
  const injectionBlocked = isInjectionAttempt(promptText) || jevDecision?.injectionBlocked === true;
  const highConfidenceMutationIntent = isHighConfidenceMutationIntent(promptText);
  const mutationKind =
    input.classifiedMutationKind ?? classifyMutationRequestWithJev(promptText, jevDecision);

  const decision = await decideMastraExecution({
    ...input,
    mutationRequested: mutationKind !== null,
    jevHints: jevDecision
      ? {
          domain: jevDecision.domain,
          xauusdChatKind: jevDecision.xauusdChatKind,
          reportFollowup: jevDecision.isReportFollowup,
        }
      : null,
  });

  const routing = decision.routing;
  const rationale = [
    `domain=${routing.domain}`,
    decision.symbol ? `symbol=${decision.symbol}` : 'symbol=none',
    `route=${decision.route}`,
    jevDecision ? `jev=${jevDecision.providerId}@${jevDecision.latencyMs}ms` : 'jev=off',
    injectionBlocked ? 'injection=blocked' : null,
    mutationKind ? `mutation=${mutationKind}` : null,
    highConfidenceMutationIntent ? 'high-confidence-mutation' : null,
    routing.rationale,
  ]
    .filter(Boolean)
    .join(' | ');

  return {
    domain: routing.domain,
    planRequired: routing.planRequired,
    symbol: decision.symbol,
    xauusdChatKind: decision.xauusdChatKind,
    injection: injectionBlocked
      ? {
          blocked: true,
          reason:
            'instruction-overriding request: read-only research boundary rejects jailbreak attempts',
        }
      : { blocked: false },
    mutationKind,
    highConfidenceMutationIntent,
    capabilityId: decision.capability?.capability?.id ?? null,
    route: decision.route,
    modelPurpose: decision.modelPurpose,
    rationale,
    decision,
    routing,
  };
}
