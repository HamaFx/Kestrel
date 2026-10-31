/*
 * Copyright 2026 Kestrel
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */

// Route and model-purpose tables for the Mastra execution decision.
//
// Split from `execution-decision.ts` (maintainability gate): the decision
// facade owns classification and plugin-intent policy, while these pure tables
// own the capability → route → model-purpose mapping.

import type { MastraModelPurpose } from '../../models/model';
import type { MastraCapabilityId } from '../capabilities';
import type { MastraExecutionRoute } from './execution-decision';

export function capabilityFor(
  mode: 'single' | 'full',
  symbol: string | null,
  mutationRequested = false,
  reportFollowup = false,
  xauusdChatKind: 'research' | 'conversation' | null = null,
  comparisonActive = false,
): MastraCapabilityId | null {
  if (mutationRequested) return 'mutation-workflows';
  // A-01: bounded comparisons run through the generic symbol capability; each
  // symbol still gets its own packet + desk pass inside the comparison graph.
  if (comparisonActive) return 'symbol-research';
  if (symbol === 'XAUUSD' && mode === 'single') {
    if (reportFollowup || xauusdChatKind === 'research') return 'xauusd-research';
    if (xauusdChatKind === 'conversation') return 'xauusd-conversation';
  }
  // Q2 two-mode collapse: any symbol in either mode goes through the
  // committee — `single` for the one-desk read, `full` for the 4-desk
  // committee (the durable queue wraps the same capability).
  if (symbol) return 'symbol-research';
  return null;
}

export function routeFor(
  mode: 'single' | 'full',
  symbol: string | null,
  mutationRequested = false,
  capabilityId: MastraCapabilityId | null,
  reportFollowup: boolean,
  xauusdCandidate: boolean,
  symbolCandidate: boolean,
  xauusdChatKind: 'research' | 'conversation' | null,
  comparisonActive = false,
  pluginRouteOverride = false,
): MastraExecutionRoute {
  if (mutationRequested || capabilityId === 'mutation-workflows') return 'mutation';
  // A-01 (B-01): comparisons take precedence over the single-symbol paths in
  // both modes — a multi-symbol prompt must never be silently answered as one
  // symbol's research or as symbol-free canonical chat.
  if (comparisonActive) return 'multi-symbol-research';
  // P0-4 — an installed plugin request runs where the plugin tools are.
  if (pluginRouteOverride) return 'canonical-chat';
  if (mode === 'full') return 'full-analysis-queue';
  if (
    symbol === 'XAUUSD' &&
    capabilityId === 'xauusd-research' &&
    (xauusdCandidate || reportFollowup)
  ) {
    return 'xauusd-research';
  }
  if (
    symbol === 'XAUUSD' &&
    capabilityId === 'xauusd-conversation' &&
    (xauusdCandidate || reportFollowup) &&
    xauusdChatKind === 'conversation'
  ) {
    return 'xauusd-conversation';
  }
  if (symbolCandidate) return 'symbol-research';
  return 'canonical-chat';
}

export function purposeFor(route: MastraExecutionRoute): MastraModelPurpose | null {
  switch (route) {
    case 'mutation':
      return null;
    case 'full-analysis-queue':
      return 'worker';
    case 'multi-symbol-research':
      return 'mode';
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
