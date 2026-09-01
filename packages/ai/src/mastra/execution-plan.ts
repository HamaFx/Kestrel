/*
 * Copyright 2026 Kestrel
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */

import type { UIMessage } from 'ai';
import { z } from 'zod';

import {
  type MastraExecutionDecisionInput,
  decideMastraExecution,
} from './execution-decision';
import { classifyMutationRequest } from './mutation-detect';
import {
  getMastraCapability,
  type MastraCapability,
  type MastraCapabilityMode,
  type MastraEvidencePolicy,
} from './capabilities';
import type { MastraResolvedModel } from '../model';

export const ExecutionRouteSchema = z.enum([
  'canonical-chat',
  'xauusd-conversation',
  'xauusd-research',
  'symbol-research',
  'full-analysis',
  'mutation-draft',
]);

export const ExecutionModeSchema = z.enum(['single', 'quick', 'standard', 'full', 'auto']);

export const ExecutionPlanSchema = z
  .object({
    version: z.literal(1),
    route: ExecutionRouteSchema,
    capabilityId: z.string().min(1).nullable(),
    capabilityVersion: z.string().min(1).nullable(),
    symbol: z.string().min(1).nullable(),
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
    }),
    maxSteps: z.number().int().positive(),
    maxDurationMs: z.number().int().positive(),
    streaming: z.boolean(),
    mutationRequested: z.boolean(),
    tenantId: z.string().min(1).nullable(),
    xauusdChatKind: z.enum(['research', 'conversation']).nullable(),
    reportFollowup: z.boolean(),
    symbolCandidate: z.boolean(),
    xauusdCandidate: z.boolean(),
  })
  .strict();

export type ExecutionPlan = z.infer<typeof ExecutionPlanSchema>;

export interface CreateExecutionPlanInput extends Omit<MastraExecutionDecisionInput, 'mutationRequested'> {
  priorReportAvailable?: boolean;
  tenantId?: string | null;
  mutationRequested?: boolean;
}

function routeForDecision(route: Awaited<ReturnType<typeof decideMastraExecution>>['route']): ExecutionPlan['route'] {
  switch (route) {
    case 'mutation':
      return 'mutation-draft';
    case 'full-analysis-queue':
      return 'full-analysis';
    default:
      return route;
  }
}

function fallbackPolicy(route: ExecutionPlan['route'], mode: MastraCapabilityMode): MastraCapability {
  return {
    id: `${route}-implicit`,
    version: '1',
    allowedSymbols: [],
    allowedModes: [mode],
    scope: route === 'canonical-chat' ? 'read-only' : 'read-only',
    readOnly: true,
    tools: [],
    requiresConfirmation: false,
    supportsStreaming: route !== 'full-analysis' && route !== 'mutation-draft',
    supportsAbort: true,
    maxSteps: route === 'canonical-chat' ? 6 : 1,
    maxDurationMs: 55_000,
    evidencePolicy: route === 'canonical-chat' ? 'optional' : 'required',
    externalData: route !== 'mutation-draft',
    contentTrust: route === 'canonical-chat' ? 'untrusted' : 'untrusted',
  };
}

/** Build the one immutable, serializable plan used by downstream execution. */
export async function createExecutionPlan(input: CreateExecutionPlanInput): Promise<ExecutionPlan> {
  const mutationRequested =
    input.mutationRequested ??
    classifyMutationRequest(
      input.userMessage.parts
        .map((part) => (part && typeof part === 'object' && 'text' in part ? String(part.text ?? '') : ''))
        .join(' '),
    ) !== null;
  const decision = await decideMastraExecution({ ...input, mutationRequested });
  const route = routeForDecision(decision.route);
  const capability = decision.capability?.capability ??
    (decision.route === 'canonical-chat'
      ? null
      : decision.route === 'full-analysis-queue'
        ? getMastraCapability('symbol-research')
        : getMastraCapability(decision.route));
  const policy = capability ?? fallbackPolicy(route, input.mode);
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
  if (capability && capability.id !== decision.capability?.capability?.id && decision.route !== 'canonical-chat') {
    throw new Error('Execution plan capability does not match the selected route.');
  }

  return ExecutionPlanSchema.parse({
    version: 1,
    route,
    capabilityId: capability?.id ?? null,
    capabilityVersion: capability?.version ?? null,
    symbol: decision.symbol,
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
    },
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
    plan.model.bareModelId === resolved.bareModelId
  );
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
