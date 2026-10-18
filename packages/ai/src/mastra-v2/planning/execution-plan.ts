/*
 * Copyright 2026 Kestrel
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */

import { z } from 'zod';

import type { MastraResolvedModel } from '../../model';
import {
  getMastraCapability,
  guardrailPolicyForCapability,
  type MastraCapabilityId,
} from '../capabilities';
import { classifyMutationRequest } from '../mutation/mutation-detect';
import { decideMastraExecution, type MastraExecutionDecisionInput } from './execution-decision';

export const ExecutionRouteSchema = z.enum([
  'canonical-chat',
  'xauusd-conversation',
  'xauusd-research',
  'symbol-research',
  'multi-symbol-research',
  'full-analysis',
  'mutation-draft',
]);

/**
 * Q2 decision: exactly two analysis modes. The Q8 shim removal (audit plan
 * §4.6) retired the one-release compat shim: serialized plans carrying the
 * legacy `quick`/`standard`/`auto` values are rejected instead of being
 * mapped. Durable Full queue rows still holding a legacy mode fail parsing
 * with the clear message below and are terminally rejected by the worker.
 */
export const ExecutionModeSchema = z.enum(['single', 'full'], {
  error:
    "analysis mode must be 'single' or 'full' (legacy quick/standard/auto values are no longer accepted)",
});

export const ExecutionPlanSchema = z.strictObject({
  version: z.literal(1),
  route: ExecutionRouteSchema,
  capabilityId: z.string().min(1).nullable(),
  capabilityVersion: z.string().min(1).nullable(),
  symbol: z.string().min(1).nullable(),
  /**
   * A-01 (B-01/B-08) — bounded comparison symbols (2–3, prompt order) for
   * `multi-symbol-research` plans; empty for every other route. Defaulted so
   * plans serialized before this audit still parse.
   */
  symbols: z.array(z.string().min(1)).default([]),
  mode: ExecutionModeSchema,
  model: z
    .object({
      providerId: z.string().min(1),
      bareModelId: z.string().min(1),
    })
    .nullable(),
  toolPolicy: z.object({
    capabilityId: z.string().min(1).nullable(),
    tools: z.array(z.string()),
    readOnly: z.boolean(),
    requiresConfirmation: z.boolean(),
  }),
  evidencePolicy: z.object({
    required: z.boolean(),
    externalData: z.boolean(),
    contentTrust: z.enum(['trusted', 'untrusted']).nullable(),
  }),
  memoryPolicy: z.object({
    mode: z.enum(['native', 'disabled']),
    required: z.boolean(),
    scope: z.enum(['user-thread', 'none']),
    semanticRecall: z.boolean().default(true),
  }),
  /**
   * Audit plan §1.2 — guardrail policy derived from the capability
   * manifest's trust level (never from NODE_ENV).
   */
  guardrail: z.object({
    mode: z.enum(['strict', 'availability']),
    strategy: z.enum(['block', 'rewrite']),
  }),
  maxSteps: z.int().positive(),
  maxDurationMs: z.int().positive(),
  streaming: z.boolean(),
  mutationRequested: z.boolean(),
  tenantId: z.string().min(1).nullable(),
  xauusdChatKind: z.enum(['research', 'conversation']).nullable(),
  reportFollowup: z.boolean(),
  symbolCandidate: z.boolean(),
  xauusdCandidate: z.boolean(),
});

export type ExecutionPlan = z.infer<typeof ExecutionPlanSchema>;

export interface CreateExecutionPlanInput extends Omit<
  MastraExecutionDecisionInput,
  'mutationRequested'
> {
  priorReportAvailable?: boolean;
  tenantId?: string | null;
  mutationRequested?: boolean;
  /**
   * Unified-router decision (audit plan §1.1). When provided, the plan is
   * built from the same single classification pass — `routeTurn` and the
   * lexical gates are not re-run.
   */
  routingDecision?: Awaited<ReturnType<typeof decideMastraExecution>>;
}

function routeForDecision(
  route: Awaited<ReturnType<typeof decideMastraExecution>>['route'],
): ExecutionPlan['route'] {
  switch (route) {
    case 'mutation':
      return 'mutation-draft';
    case 'full-analysis-queue':
      return 'full-analysis';
    default:
      return route;
  }
}

/**
 * B-03 (audit 2026-10-18) — the capability manifest entry implementing each
 * plan route. Every route resolves here; a route without a manifest entry
 * fails the plan closed instead of falling back to a synthesized policy
 * literal (which previously hardcoded `maxSteps` and silently ignored
 * manifest changes — e.g. a capability that raised its own step limit).
 */
function planCapabilityId(route: ExecutionPlan['route']): MastraCapabilityId {
  switch (route) {
    case 'canonical-chat':
      return 'canonical-chat';
    case 'mutation-draft':
      return 'mutation-workflows';
    case 'full-analysis':
    case 'symbol-research':
    case 'multi-symbol-research':
      return 'symbol-research';
    case 'xauusd-conversation':
      return 'xauusd-conversation';
    case 'xauusd-research':
      return 'xauusd-research';
  }
}

/** Build the one immutable, serializable plan used by downstream execution. */
export async function createExecutionPlan(input: CreateExecutionPlanInput): Promise<ExecutionPlan> {
  const mutationRequested =
    input.mutationRequested ??
    classifyMutationRequest(
      input.userMessage.parts
        .map((part) =>
          part && typeof part === 'object' && 'text' in part ? String(part.text ?? '') : '',
        )
        .join(' '),
    ) !== null;
  // Audit plan §1.1: when the caller already ran the unified router, reuse
  // its decision instead of classifying the turn a second time.
  const decision =
    input.routingDecision ?? (await decideMastraExecution({ ...input, mutationRequested }));
  const route = routeForDecision(decision.route);
  const capability =
    decision.capability?.capability ?? getMastraCapability(planCapabilityId(route));
  // B-03 (audit 2026-10-18): fail closed. `maxSteps`/`maxDurationMs` and every
  // other policy value derive solely from the active capability manifest — a
  // route whose capability cannot be resolved must never execute.
  if (!capability) {
    throw new Error(
      `Execution plan route ${route} has no capability manifest entry; refusing to build an implicit policy.`,
    );
  }
  const policy = capability;
  const model: ExecutionPlan['model'] = decision.model
    ? { providerId: decision.model.providerId, bareModelId: decision.model.bareModelId }
    : null;

  if (
    decision.capability &&
    !decision.capability.allowed &&
    decision.capability.reason !== 'model-override' &&
    route !== 'mutation-draft'
  ) {
    throw new Error(`Execution plan capability rejected: ${decision.capability.reason}.`);
  }
  if (
    capability &&
    capability.id !== decision.capability?.capability?.id &&
    decision.route !== 'canonical-chat'
  ) {
    throw new Error('Execution plan capability does not match the selected route.');
  }

  return ExecutionPlanSchema.parse({
    version: 1,
    route,
    capabilityId: capability?.id ?? null,
    capabilityVersion: capability?.version ?? null,
    symbol: decision.symbol,
    symbols: decision.symbols,
    mode: input.mode,
    model,
    toolPolicy: {
      capabilityId: capability?.id ?? null,
      tools: [...policy.tools],
      readOnly: policy.readOnly,
      requiresConfirmation: policy.requiresConfirmation,
    },
    evidencePolicy: {
      required: policy.evidencePolicy === 'required',
      externalData: policy.externalData,
      contentTrust: policy.evidencePolicy === 'none' ? null : policy.contentTrust,
    },
    memoryPolicy: {
      mode: route === 'mutation-draft' ? 'disabled' : 'native',
      required: route !== 'mutation-draft',
      scope: route === 'mutation-draft' ? 'none' : 'user-thread',
      semanticRecall: policy.semanticRecall ?? true,
    },
    guardrail: guardrailPolicyForCapability(policy),
    maxSteps: policy.maxSteps,
    maxDurationMs: policy.maxDurationMs,
    streaming: route === 'canonical-chat' || route === 'xauusd-conversation',
    mutationRequested,
    tenantId: input.tenantId ?? null,
    xauusdChatKind: decision.xauusdChatKind,
    reportFollowup: decision.reportFollowup,
    symbolCandidate: decision.symbolCandidate,
    xauusdCandidate: decision.xauusdCandidate,
  });
}

export function serializeExecutionPlan(plan: ExecutionPlan): string {
  return JSON.stringify(ExecutionPlanSchema.parse(plan));
}

export function parseExecutionPlan(value: unknown): ExecutionPlan {
  return ExecutionPlanSchema.parse(typeof value === 'string' ? JSON.parse(value) : value);
}

export function resolvedModelSnapshotForPlan(
  plan: ExecutionPlan,
  resolved: MastraResolvedModel,
): boolean {
  return (
    plan.model?.providerId === resolved.providerId &&
    plan.model?.bareModelId === resolved.bareModelId
  );
}

/** Return the plan snapshot or fail closed before any provider is selected. */
export function requireExecutionPlanModel(
  plan: ExecutionPlan,
): NonNullable<ExecutionPlan['model']> {
  if (!plan.model) {
    throw new Error('Execution plan is missing its immutable model snapshot.');
  }
  return plan.model;
}

/** Validate that a runner is executing the route selected by the planner. */
export function assertExecutionPlanRoute(
  plan: ExecutionPlan,
  expected: ExecutionPlan['route'],
): void {
  if (plan.route !== expected) {
    throw new Error(`Execution plan route mismatch: expected ${expected}, received ${plan.route}.`);
  }
}
