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
//
// Phase 4 Task 4 — the legacy XAUUSD (`poc-5`) route split is retired. XAUUSD
// is a first-class member of `ALL_SYMBOLS`: single-symbol research (any symbol
// including XAUUSD) runs `symbol-research`, and conversational follow-ups run
// `canonical-chat`.

import type { MastraModelPurpose } from '../../models/model';
import type { MastraCapabilityId } from '../capabilities';
import type { MastraExecutionRoute } from './execution-decision';

export function capabilityFor(
  mutationRequested = false,
  symbolCandidate = false,
  comparisonActive = false,
  sensitiveUserReadRequested = false,
): MastraCapabilityId | null {
  if (mutationRequested) return 'mutation-workflows';
  // A-01: bounded comparisons run through the generic symbol capability; each
  // symbol still gets its own packet + desk pass inside the comparison graph.
  if (comparisonActive) return 'symbol-research';
  // Q2 two-mode collapse: any named symbol in either mode goes through the
  // committee — `single` for the one-desk read, `full` for the 4-desk
  // committee (the durable queue wraps the same capability).
  if (symbolCandidate) return 'symbol-research';
  // Phase 4 Task 3: journal / alert / position-health reads stay in canonical
  // chat but are granted through the explicit sensitive-read capability.
  if (sensitiveUserReadRequested) return 'sensitive-user-read';
  return null;
}

export function routeFor(
  mode: 'single' | 'full',
  mutationRequested = false,
  capabilityId: MastraCapabilityId | null = null,
  symbolCandidate = false,
  comparisonActive = false,
  pluginRouteOverride = false,
): MastraExecutionRoute {
  if (mutationRequested || capabilityId === 'mutation-workflows') return 'mutation';
  // P0-4 / Phase 4 — an installed plugin command runs where the plugin tools
  // live. It beats Full mode and bounded comparisons: neither route carries
  // the plugin's `main-chat` tools.
  if (pluginRouteOverride) return 'canonical-chat';
  // A-01 (B-01): comparisons take precedence over the single-symbol paths in
  // both modes — a multi-symbol prompt must never be silently answered as one
  // symbol's research or as symbol-free canonical chat.
  if (comparisonActive) return 'multi-symbol-research';
  if (mode === 'full') return 'full-analysis-queue';
  // Any named symbol (XAUUSD included) runs the shared committee pipeline;
  // symbol-free prompts and implicit report follow-ups stay conversational.
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
    case 'symbol-research':
      return 'mode';
    case 'canonical-chat':
      return 'canonical-chat';
  }
}
