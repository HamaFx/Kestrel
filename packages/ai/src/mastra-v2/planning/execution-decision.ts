/*
 * Copyright 2026 Kestrel
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */

import type { UserSettingsRow } from '@kestrel/db/schema';
import type { UIMessage } from 'ai';

import type { ResolveModelEnv } from '../../models/env-factory';
import {
  resolveMastraExecutionModel,
  type MastraModelPurpose,
  type MastraResolvedModel,
} from '../../models/model';
import { detectInstalledPluginIntent } from '../../plugins/intent';
import { resolveSemanticRoutingConfig, routeTurn, type RoutingDecision } from '../../routing';
import { isUserDataReadIntent } from '../../routing/keywords';
import {
  evaluateMastraCapability,
  getMastraCapability,
  type MastraCapabilityDecision,
  type MastraCapabilityId,
} from '../capabilities';
import { classifyMutationRequest } from '../mutation/mutation-detect';
import { capabilityFor, purposeFor, routeFor } from './execution-routes';
import {
  extractMastraSymbol,
  isMastraSymbolCandidate,
  isMastraXauusdFollowupCandidate,
  mastraComparisonScope,
  messageText,
} from './routing-policy';

export type MastraExecutionRoute =
  | 'mutation'
  | 'multi-symbol-research'
  | 'symbol-research'
  | 'canonical-chat';

export interface MastraExecutionDecisionInput {
  userMessage: UIMessage;
  priorReportAvailable?: boolean;
  symbol?: string | null;
  /** Q2 decision: exactly two modes — `single` and `full`. */
  mode: 'single' | 'full';
  modelOverride?: string | null;
  settings: Pick<UserSettingsRow, 'aiApiKeys' | 'chatModel'>;
  env: ResolveModelEnv;
  mutationRequested?: boolean;
  capabilityId?: MastraCapabilityId;
  /**
   * Phase 4 Task 3 — explicit user-data read hint. When omitted the
   * deterministic keyword gate (`isUserDataReadIntent`) decides.
   */
  sensitiveUserRead?: boolean;
  signal?: AbortSignal | null;
  /**
   * P0-4 — enabled plugin ids for this user. When the prompt explicitly asks
   * an installed plugin to do something, single-mode turns route to
   * `canonical-chat` (where the plugin's tools and UI cards live) instead of
   * `xauusd-*` / `symbol-research`.
   */
  installedPluginIds?: readonly string[];
}

export interface MastraExecutionDecision {
  route: MastraExecutionRoute;
  routing: RoutingDecision;
  capability: MastraCapabilityDecision | null;
  model: MastraResolvedModel | null;
  modelPurpose: MastraModelPurpose | null;
  symbol: string | null;
  /**
   * A-01 — bounded comparison symbols (2–3, prompt order) when the turn is a
   * cross-symbol comparison; empty otherwise.
   */
  symbols: string[];
  reportFollowup: boolean;
  symbolCandidate: boolean;
}

/**
 * Single decision facade for Mastra composition edges. Callers may still
 * choose route-specific persistence/streaming services, but routing policy,
 * capability checks, and model resolution are represented in one auditable
 * result.
 */
export async function decideMastraExecution(
  input: MastraExecutionDecisionInput,
): Promise<MastraExecutionDecision> {
  const semanticRouting = resolveSemanticRoutingConfig(input.settings, input.env, input.signal);
  const baseRouting = await routeTurn({
    userMessage: input.userMessage,
    ...(input.modelOverride !== undefined ? { modelOverride: input.modelOverride } : {}),
    ...(semanticRouting ? { semanticRouting } : {}),
  });
  const routing: RoutingDecision = baseRouting;
  const promptText = messageText(input.userMessage);
  const priorReportAvailable = input.priorReportAvailable === true;
  const reportFollowup = priorReportAvailable && isMastraXauusdFollowupCandidate(promptText);
  const symbol =
    input.symbol ?? extractMastraSymbol(promptText) ?? (reportFollowup ? 'XAUUSD' : null);
  // A-01 (B-01/B-08): a prompt naming 2–3 symbols is a bounded comparison —
  // it must not collapse to canonical chat through the single-symbol extractor.
  const comparison = mastraComparisonScope(promptText);
  const comparisonActive = comparison.symbols.length >= 2;
  const symbolCandidate = isMastraSymbolCandidate(promptText);
  // Mutation classification belongs to the planner boundary. Callers may
  // provide an explicit server-side decision, but never rely on route code to
  // classify it after planning.
  const mutationRequested = input.mutationRequested ?? classifyMutationRequest(promptText) !== null;
  // Phase 4 Task 3 — user-journal / alert-status / position-health reads are
  // sensitive user-scoped reads, not public market-data queries.
  const sensitiveUserRead = input.sensitiveUserRead ?? isUserDataReadIntent(promptText);
  // P0-4 / Phase 4 (roadmap Phase 5) — an explicit request aimed at an
  // installed plugin ("Backtest RSI on XAUUSD", "Buy 1 lot EURUSD in my paper
  // account", "Schedule my Telegram briefing") must stay in canonical chat:
  // that is the only route carrying the plugin's `main-chat` tools and their
  // chat cards. Core mutations (alerts/journal/snapshots) keep precedence, but
  // the plugin intent now beats Full mode and multi-symbol comparisons too.
  const pluginIntent = detectInstalledPluginIntent(promptText, input.installedPluginIds ?? []);
  const pluginRouteOverride =
    pluginIntent !== null && input.capabilityId === undefined && !mutationRequested;
  // Full mode is an explicit request for the committee. Honor the thread's
  // resolved/pinned symbol even when the prompt does not name it again, so a
  // user who selected Full does not silently fall back to canonical chat.
  const symbolResearch = symbolCandidate || (input.mode === 'full' && symbol !== null);
  const capabilityId =
    input.capabilityId ??
    (pluginRouteOverride
      ? null
      : capabilityFor(mutationRequested, symbolResearch, comparisonActive, sensitiveUserRead));
  const capability = capabilityId
    ? evaluateMastraCapability({
        capabilityId,
        symbol: comparison.symbols[0] ?? symbol ?? 'XAUUSD',
        mode: input.mode,
        hasModelOverride: Boolean(input.modelOverride),
        mutationRequested,
      })
    : null;
  const route = routeFor(
    mutationRequested,
    capabilityId,
    symbolResearch,
    comparisonActive,
    pluginRouteOverride,
  );
  if (
    capability &&
    !capability.allowed &&
    capability.reason !== 'model-override' &&
    route !== 'mutation'
  ) {
    throw new Error(`Mastra capability rejected: ${capability.reason}.`);
  }
  const purpose = purposeFor(route);
  // Model resolution is part of the decision contract, but a policy-only
  // decision remains useful when no provider is configured (for example,
  // validation and routing tests or an onboarding request).
  let model: MastraResolvedModel | null = null;
  if (purpose) {
    try {
      model = resolveMastraExecutionModel({
        purpose,
        settings: input.settings,
        env: input.env,
        domain: routing.domain === 'generic' ? 'technical' : routing.domain,
        ...(input.modelOverride !== undefined ? { modelOverride: input.modelOverride } : {}),
      });
    } catch (error) {
      if (route !== 'canonical-chat') throw error;
    }
  }
  return {
    route,
    routing,
    capability,
    model,
    modelPurpose: purpose,
    symbol,
    symbols: comparison.symbols,
    reportFollowup,
    symbolCandidate,
  };
}

export function capabilityForRoute(route: MastraExecutionRoute): MastraCapabilityId | null {
  switch (route) {
    case 'mutation':
      return 'mutation-workflows';
    case 'multi-symbol-research':
      return 'symbol-research';
    case 'symbol-research':
      return 'symbol-research';
    default:
      return null;
  }
}

export function capabilityDefinitionForRoute(route: MastraExecutionRoute) {
  const id = capabilityForRoute(route);
  return id ? getMastraCapability(id) : null;
}
