/*
 * Copyright 2026 Kestrel
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */

import type { UserSettingsRow } from '@kestrel/db/schema';
import type { UIMessage } from 'ai';

import { classifyMutationRequest } from './mutation-detect';

import {
  resolveMastraExecutionModel,
  type MastraModelPurpose,
  type MastraResolvedModel,
} from '../model';
import { resolveSemanticRoutingConfig, routeTurn, type RoutingDecision } from '../routing';
import {
  isMastraXauusdFollowupCandidate,
  isMastraXauusdCandidate,
  isMastraSymbolCandidate,
  extractMastraSymbol,
  mastraXauusdChatKind,
  messageText,
} from './routing-policy';
import type { ResolveModelEnv } from '../vertex-factory';
import {
  evaluateMastraCapability,
  getMastraCapability,
  type MastraCapabilityDecision,
  type MastraCapabilityId,
} from './capabilities';

export type MastraExecutionRoute =
  | 'mutation'
  | 'full-analysis-queue'
  | 'xauusd-conversation'
  | 'xauusd-research'
  | 'symbol-research'
  | 'canonical-chat';

export interface MastraExecutionDecisionInput {
  userMessage: UIMessage;
  priorReportAvailable?: boolean;
  symbol?: string | null;
  mode: 'single' | 'quick' | 'standard' | 'full' | 'auto';
  modelOverride?: string | null;
  settings: Pick<UserSettingsRow, 'aiApiKeys' | 'chatModel'>;
  env: ResolveModelEnv;
  mutationRequested?: boolean;
  capabilityId?: MastraCapabilityId;
  signal?: AbortSignal | null;
}

export interface MastraExecutionDecision {
  route: MastraExecutionRoute;
  routing: RoutingDecision;
  capability: MastraCapabilityDecision | null;
  model: MastraResolvedModel | null;
  modelPurpose: MastraModelPurpose | null;
  symbol: string | null;
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
  const routing = await routeTurn({
    userMessage: input.userMessage,
    ...(input.modelOverride !== undefined ? { modelOverride: input.modelOverride } : {}),
    ...(semanticRouting ? { semanticRouting } : {}),
  });
  const promptText = messageText(input.userMessage);
  const symbol = input.symbol ?? extractMastraSymbol(promptText);
  const priorReportAvailable = input.priorReportAvailable === true;
  const reportFollowup = priorReportAvailable && isMastraXauusdFollowupCandidate(promptText);
  const xauusdCandidate = isMastraXauusdCandidate(promptText);
  const symbolCandidate = isMastraSymbolCandidate(promptText);
  // Mutation classification belongs to the planner boundary. Callers may
  // provide an explicit server-side decision, but never rely on route code to
  // classify it after planning.
  const mutationRequested =
    input.mutationRequested ?? classifyMutationRequest(promptText) !== null;
  const capabilityId = input.capabilityId ?? capabilityFor(input.mode, symbol, mutationRequested);
  const capability = capabilityId
    ? evaluateMastraCapability({
        capabilityId,
        symbol: symbol ?? 'XAUUSD',
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
  );
  if (capability && !capability.allowed && capability.reason !== 'model-override' && route !== 'mutation') {
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
    xauusdChatKind:
      symbol === 'XAUUSD' && xauusdCandidate
        ? mastraXauusdChatKind(promptText, priorReportAvailable)
        : null,
    reportFollowup,
    symbolCandidate,
    xauusdCandidate,
  };
}

function capabilityFor(
  mode: MastraExecutionDecisionInput['mode'],
  symbol: string | null,
  mutationRequested = false,
): MastraCapabilityId | null {
  if (mutationRequested) return 'mutation-workflows';
  if (symbol === 'XAUUSD' && (mode === 'single' || mode === 'auto')) return 'xauusd-conversation';
  if (mode !== 'single' && mode !== 'auto' && symbol) return 'symbol-research';
  return null;
}

function routeFor(
  mode: MastraExecutionDecisionInput['mode'],
  symbol: string | null,
  mutationRequested = false,
  capabilityId: MastraCapabilityId | null,
  reportFollowup: boolean,
  xauusdCandidate: boolean,
  symbolCandidate: boolean,
): MastraExecutionRoute {
  if (mutationRequested || capabilityId === 'mutation-workflows') return 'mutation';
  if (mode === 'full') return 'full-analysis-queue';
  if (symbol === 'XAUUSD' && capabilityId === 'xauusd-conversation' && xauusdCandidate) {
    return 'xauusd-conversation';
  }
  if (symbol === 'XAUUSD' && capabilityId === 'xauusd-research' && (xauusdCandidate || reportFollowup)) {
    return 'xauusd-research';
  }
  if ((mode === 'quick' || mode === 'standard') && symbolCandidate) return 'symbol-research';
  return 'canonical-chat';
}

function purposeFor(route: MastraExecutionRoute): MastraModelPurpose | null {
  switch (route) {
    case 'mutation':
      return null;
    case 'full-analysis-queue':
      return 'worker';
    case 'xauusd-conversation':
      return 'xauusd';
    case 'xauusd-research':
      return 'xauusd';
    case 'symbol-research':
      return 'mode';
    case 'canonical-chat':
      return 'canonical-chat';
  }
}

export function capabilityForRoute(route: MastraExecutionRoute): MastraCapabilityId | null {
  switch (route) {
    case 'mutation':
      return 'mutation-workflows';
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
