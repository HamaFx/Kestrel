/**
 * Copyright 2026 Kestrel
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */

import { estimateCostUsd } from './cost';

export type AuxiliaryCallKind =
  | 'semantic-routing'
  | 'guardrail'
  | 'embedding'
  | 'title'
  | 'planner'
  | 'scorer'
  | 'specialist';

export interface AuxiliaryUsage {
  kind: AuxiliaryCallKind;
  model: string;
  inputTokens: number;
  outputTokens: number;
  usageKnown: boolean;
  estimatedCostUsd: number;
  runId?: string;
  threadId?: string;
}

export function normalizeUsage(input: {
  model: string;
  kind: AuxiliaryCallKind;
  inputTokens?: number;
  outputTokens?: number;
  usageKnown?: boolean;
  runId?: string;
  threadId?: string;
}): AuxiliaryUsage {
  const inputTokens = Number.isFinite(input.inputTokens) && (input.inputTokens ?? 0) >= 0 ? input.inputTokens ?? 0 : 0;
  const outputTokens = Number.isFinite(input.outputTokens) && (input.outputTokens ?? 0) >= 0 ? input.outputTokens ?? 0 : 0;
  const usageKnown = input.usageKnown ?? (input.inputTokens !== undefined || input.outputTokens !== undefined);
  return {
    kind: input.kind,
    model: input.model,
    inputTokens,
    outputTokens,
    usageKnown,
    estimatedCostUsd: estimateCostUsd(input.model, inputTokens, outputTokens),
    ...(input.runId ? { runId: input.runId } : {}),
    ...(input.threadId ? { threadId: input.threadId } : {}),
  };
}
