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
import {
  resolveSemanticRoutingConfig,
  routeTurn,
  type RoutingDecision,
  type RoutingDomain,
} from '../../routing';
import { isHighConfidenceMutationIntent } from '../../routing/keywords';
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
  isInjectionAttempt,
  isMastraSymbolCandidate,
  isMastraXauusdCandidate,
  isMastraXauusdFollowupCandidate,
  mastraComparisonScope,
  mastraXauusdChatKind,
  messageText,
} from './routing-policy';

export type MastraExecutionRoute =
  | 'mutation'
  | 'full-analysis-queue'
  | 'multi-symbol-research'
  | 'xauusd-conversation'
  | 'xauusd-research'
  | 'symbol-research'
  | 'canonical-chat';

/**
 * Phase 1 (Jev System One) — confident routing hints from the parallel Jev
 * turn router. Hints may only *add* information: the deterministic lexical
 * gates (`isInjectionAttempt`, `isHighConfidenceMutationIntent`, symbol
 * candidates) always run and can never be weakened by a hint.
 */
export interface MastraJevRoutingHints {
  /** Confident domain classification (vision stays deterministic). */
  domain?: RoutingDomain | null;
  /** Confident XAUUSD report path hint. */
  xauusdChatKind?: 'research' | 'conversation' | null;
  /** True when a prior report exists AND Jev cleared the follow-up threshold. */
  reportFollowup?: boolean;
}

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
  signal?: AbortSignal | null;
  /**
   * P0-4 — enabled plugin ids for this user. When the prompt explicitly asks
   * an installed plugin to do something, single-mode turns route to
   * `canonical-chat` (where the plugin's tools and UI cards live) instead of
   * `xauusd-*` / `symbol-research`.
   */
  installedPluginIds?: readonly string[];
  /** Phase 1 (Jev) — optional confident routing hints. */
  jevHints?: MastraJevRoutingHints | null;
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
  xauusdChatKind: 'research' | 'conversation' | null;
  reportFollowup: boolean;
  symbolCandidate: boolean;
  xauusdCandidate: boolean;
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
  const jevDomain = input.jevHints?.domain ?? null;
  const hasModelOverride = Boolean(input.modelOverride && input.modelOverride.length > 0);
  const baseRouting = await routeTurn({
    userMessage: input.userMessage,
    ...(input.modelOverride !== undefined ? { modelOverride: input.modelOverride } : {}),
    // Phase 1 (Jev): a confident domain hint already answered this turn, so
    // the generative semantic classifier is skipped entirely. When no hint is
    // present the previous semantic path runs unchanged.
    ...(semanticRouting && !jevDomain ? { semanticRouting } : {}),
  });
  // Vision attachments and explicit model overrides stay deterministic; a Jev
  // hint may fill the domain for every other turn but can never override
  // either of those boundaries.
  const routing: RoutingDecision =
    jevDomain && baseRouting.domain !== 'vision' && !hasModelOverride
      ? {
          domain: jevDomain,
          planRequired: jevDomain === 'fundamental' || jevDomain === 'technical',
          rationale: `jev: domain=${jevDomain} (systemone)`,
        }
      : baseRouting;
  const promptText = messageText(input.userMessage);
  const priorReportAvailable = input.priorReportAvailable === true;
  // Phase 1 (Jev): a Jev report-follow-up hint upgrades an implicit follow-up
  // ("does that still hold?") into a report conversation — but only when the
  // deterministic safety gates (injection / high-confidence mutation) agree.
  const jevReportFollowup =
    priorReportAvailable &&
    input.jevHints?.reportFollowup === true &&
    !isInjectionAttempt(promptText) &&
    !isHighConfidenceMutationIntent(promptText);
  const reportFollowup =
    (priorReportAvailable && isMastraXauusdFollowupCandidate(promptText)) || jevReportFollowup;
  const symbol =
    input.symbol ?? extractMastraSymbol(promptText) ?? (reportFollowup ? 'XAUUSD' : null);
  // A-01 (B-01/B-08): a prompt naming 2–3 symbols is a bounded comparison —
  // it must not collapse to canonical chat through the single-symbol extractor.
  const comparison = mastraComparisonScope(promptText);
  const comparisonActive = comparison.symbols.length >= 2;
  const xauusdCandidate = isMastraXauusdCandidate(promptText);
  const symbolCandidate = isMastraSymbolCandidate(promptText);
  const detectedXauusdChatKind =
    !comparisonActive && symbol === 'XAUUSD' && (xauusdCandidate || reportFollowup)
      ? (input.jevHints?.xauusdChatKind ?? mastraXauusdChatKind(promptText, priorReportAvailable))
      : null;
  // Mutation classification belongs to the planner boundary. Callers may
  // provide an explicit server-side decision, but never rely on route code to
  // classify it after planning.
  const mutationRequested = input.mutationRequested ?? classifyMutationRequest(promptText) !== null;
  // P0-4 — an explicit request aimed at an installed plugin ("Backtest RSI on
  // XAUUSD", "Buy 1 lot EURUSD in my paper account", "Schedule my Telegram
  // briefing") must stay in canonical chat: that is the only route carrying the
  // plugin's `main-chat` tools and their chat cards. Comparisons, core
  // mutations, Full mode and explicit capability overrides keep precedence.
  const pluginIntent = detectInstalledPluginIntent(promptText, input.installedPluginIds ?? []);
  const pluginRouteOverride =
    pluginIntent !== null &&
    input.capabilityId === undefined &&
    input.mode === 'single' &&
    !mutationRequested &&
    !comparisonActive;
  const capabilityId =
    input.capabilityId ??
    (pluginRouteOverride
      ? null
      : capabilityFor(
          input.mode,
          symbol,
          mutationRequested,
          reportFollowup,
          detectedXauusdChatKind,
          comparisonActive,
        ));
  const plannedXauusdChatKind = pluginRouteOverride
    ? null
    : capabilityId === 'xauusd-research'
      ? reportFollowup
        ? 'conversation'
        : 'research'
      : capabilityId === 'xauusd-conversation'
        ? 'conversation'
        : detectedXauusdChatKind;
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
    input.mode,
    symbol,
    mutationRequested,
    capabilityId,
    reportFollowup,
    xauusdCandidate,
    symbolCandidate,
    plannedXauusdChatKind,
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
      if (route !== 'canonical-chat' && route !== 'full-analysis-queue') throw error;
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
    xauusdChatKind: plannedXauusdChatKind,
    reportFollowup,
    symbolCandidate,
    xauusdCandidate,
  };
}

export function capabilityForRoute(route: MastraExecutionRoute): MastraCapabilityId | null {
  switch (route) {
    case 'mutation':
      return 'mutation-workflows';
    case 'multi-symbol-research':
      return 'symbol-research';
    case 'xauusd-conversation':
      return 'xauusd-conversation';
    case 'xauusd-research':
      return 'xauusd-research';
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
