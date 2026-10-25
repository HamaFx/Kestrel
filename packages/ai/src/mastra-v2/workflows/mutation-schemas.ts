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

// Mutation workflow schemas, executor contracts, and trusted-state parsing.

import { createHash } from 'node:crypto';

import { RunSystemActionInputSchema, safeParseJson, SymbolSchema } from '@kestrel/shared';
import { AlertChannelSchema, AlertRuleSchema } from '@kestrel/shared/schemas/alerts';
import type { Mastra } from '@mastra/core';
import { z } from 'zod';

import { isRegisteredSystemAction, type SystemActionId } from '../mutation/mutation-policy';

export const MutationKindSchema = z.enum([
  'set_alert',
  'log_journal',
  'share_snapshot',
  'run_system_action',
]);
export type MutationKind = z.infer<typeof MutationKindSchema>;

/** Discriminated input by mutation kind — the workflow factory selects the branch. */
export const MutationInputSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('set_alert'),
    rule: AlertRuleSchema,
    channels: z.array(AlertChannelSchema).optional(),
    note: z.string().nullable().optional(),
    snoozeHours: z.int().min(0).max(168).optional(),
  }),
  z.object({
    kind: z.literal('log_journal'),
    symbol: SymbolSchema,
    side: z.enum(['long', 'short']),
    openedAt: z.int(),
    entry: z.number(),
    stop: z.number().nullable().optional(),
    target: z.number().nullable().optional(),
    exit: z.number().nullable().optional(),
    size: z.number().nullable().optional(),
    outcome: z.enum(['win', 'loss', 'breakeven', 'open']).optional(),
    rMultiple: z.number().nullable().optional(),
    notes: z.string().nullable().optional(),
    tags: z.array(z.string()).optional(),
  }),
  z.object({
    kind: z.literal('share_snapshot'),
    title: z.string().min(2).max(200),
    body: z.string().min(2).max(8000),
    symbol: SymbolSchema.optional(),
    tf: z.string().optional(),
    /** Minutes until the share link expires (5 min .. 30 days). */
    ttlMinutes: z
      .int()
      .min(5)
      .max(30 * 24 * 60)
      .optional(),
  }),
  z.object({
    kind: z.literal('run_system_action'),
    action: RunSystemActionInputSchema.shape.action,
    params: z.record(z.string(), z.unknown()).optional(),
  }),
]);
export type MutationInput = z.infer<typeof MutationInputSchema>;

/** Payload the client receives after draft — the confirmation card data. */
export const MutationSuspendPayloadSchema = z.object({
  mutation: MutationKindSchema,
  summary: z.string(),
  runId: z.string(),
  /** ms epoch UTC — the confirmation expires. */
  expiresAt: z.int(),
  /**
   * Single-use bearer token the client presents on resume. The server keeps
   * only its HMAC digest in the run snapshot — the raw token exists only in
   * this payload.
   */
  confirmationToken: z.string(),
  confirmLabel: z.string().default('Confirm'),
  cancelLabel: z.string().default('Cancel'),
});
export type MutationSuspendPayload = z.infer<typeof MutationSuspendPayloadSchema>;

/** Resume input: the single-use token minted at draft time. */
export const MutationResumeSchema = z.object({
  confirmationToken: z.string().min(1),
});
export type MutationResumeInput = z.infer<typeof MutationResumeSchema>;

export const MutationOutputSchema = z.object({
  status: z.enum(['executed', 'rejected']),
  mutation: MutationKindSchema,
  resultId: z.string().nullable(),
  url: z.string().nullable(),
  summary: z.string(),
});
export type MutationOutput = z.infer<typeof MutationOutputSchema>;

/** Draft step output after confirmation — the full input, marked confirmed. */
export const ConfirmedInputSchema = z.object({
  confirmed: z.literal(true),
  input: MutationInputSchema,
});

/**
 * Workflow-boundary view of the input schema.
 *
 * Mastra's `Workflow` infers its `TInput` from the raw schema's *input* side,
 * while `createStep` types `inputData` from the *parsed output*. Because
 * `AlertRuleSchema` normalizes `tf` through a transform (input `string` →
 * output `Timeframe`), those two sides diverge and the first `.then(draftStep)`
 * fails type-checking. Pinning the boundary type to the parsed `MutationInput`
 * keeps the `.then()` chain in lockstep with the step schemas; runtime
 * validation still runs the full `MutationInputSchema`.
 */
export const WorkflowInputSchema = MutationInputSchema as unknown as z.ZodType<MutationInput>;

// --- executor contracts ----------------------------------------------------

export interface MutationExecutorResult {
  id: string;
  url?: string;
}

/** Executes the audited write. Injected by the composition edge (web route). */
export type MutationExecutor = (input: MutationInput) => Promise<MutationExecutorResult>;

/** Atomic executor supplied by the composition edge. It must commit the
 * business write, audit row, and execution ledger in one transaction. */
export type MutationAtomicExecutor = (
  input: MutationInput,
  context: {
    runId: string;
    userId: string;
    threadId: string;
    inputDigest: string;
    approvalId: string;
    approvalExpiresAt: number;
  },
) => Promise<MutationExecutorResult>;

export interface MutationWorkflowDeps {
  /** Mutation kind this workflow implements (fixes the input branch). */
  mutation: MutationKind;
  userId: string;
  threadId: string;
  /** Executes the Drizzle write. Owned by the web route (DIP-1). */
  execute: MutationExecutor;
  /**
   * Current server-side role decision for operator actions. Missing/false
   * fails closed; this value is never accepted from workflow input.
   */
  isAdmin?: boolean;
  /** Legacy test/studio hook. Production callers must provide executeAtomic. */
  writeAudit?: (userId: string, action: string, metadata: Record<string, unknown>) => Promise<void>;
  /** Transactional, idempotent executor used by the production confirmation route. */
  executeAtomic?: MutationAtomicExecutor;
  /** Shared Mastra instance for run-snapshot persistence (optional). */
  mastra?: Mastra;
  /** Confirmation TTL. Defaults to the policy default (15 min). */
  ttlMs?: number;
  /** Clock override for tests. */
  now?: () => number;
  /** HMAC secret override for tests. */
  secret?: string;
}

export type MutationState = MutationRunContext;

export interface MutationRunContext {
  userId: string;
  threadId: string;
  mutation: MutationKind;
  /** Bound system action for operator mutations; absent for other mutations. */
  systemAction?: SystemActionId;
  inputDigest: string;
  confirmation: { digest: string; expiresAt: number; inputDigest: string };
}

export function humanSummary(input: MutationInput): string {
  switch (input.kind) {
    case 'set_alert':
      return `Set alert on ${input.rule.symbol} (${input.rule.type})${input.note ? ` — ${input.note}` : ''}`;
    case 'log_journal':
      return `Log ${input.side} ${input.symbol} journal entry @ ${input.entry}`;
    case 'share_snapshot':
      return `Share snapshot “${input.title}”${input.symbol ? ` for ${input.symbol}` : ''}`;
    case 'run_system_action':
      return `Run system action: ${input.action}`;
    default:
      return 'Unknown mutation';
  }
}

export function mutationDisplayName(mutation: MutationKind): string {
  return mutation.replaceAll('_', ' ');
}

export function mutationPolicyError(reason: 'token-invalid' | 'token-expired'): Error {
  const error = new Error(
    reason === 'token-expired'
      ? 'Mastra mutation confirmation token has expired.'
      : 'Mastra mutation confirmation token is invalid.',
  );
  error.name = 'MastraMutationPolicyError';
  Object.assign(error, {
    code: `MASTRA_MUTATION_${reason.toUpperCase().replaceAll('-', '_')}`,
  });
  return error;
}

function stableSerialize(value: unknown): string {
  if (value === undefined) return 'undefined';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key])}`)
    .join(',')}}`;
}

export function mutationInputDigest(input: MutationInput): string {
  return createHash('sha256').update(stableSerialize(input)).digest('hex');
}

const SystemActionIdSchema = z.custom<SystemActionId>(
  (value) => typeof value === 'string' && isRegisteredSystemAction(value),
  'Unregistered system action',
);

export const MutationRunContextSchema = z.object({
  userId: z.string().min(1),
  threadId: z.string().min(1),
  mutation: MutationKindSchema,
  systemAction: SystemActionIdSchema.optional(),
  inputDigest: z.string().regex(/^[a-f0-9]{64}$/),
  confirmation: z.object({
    digest: z.string().min(1),
    expiresAt: z.int(),
    inputDigest: z.string().regex(/^[a-f0-9]{64}$/),
  }),
});

/**
 * Workflow-level state schema — looser than the persisted run context because
 * the confirmation digest/exchange fields are only populated mid-run. Shared
 * by the draft step and the workflow itself so Mastra's step/workflow state
 * generics stay aligned.
 */
export const MutationWorkflowStateSchema = z.object({
  userId: z.string(),
  threadId: z.string(),
  mutation: MutationKindSchema,
  inputDigest: z.string(),
  systemAction: SystemActionIdSchema.optional(),
  confirmation: z.object({
    digest: z.string(),
    expiresAt: z.int(),
    inputDigest: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
  }),
});

/** Parse the trusted state persisted in a Mastra workflow snapshot. */
export function parseMutationRunContext(run: unknown): MutationRunContext | null {
  if (!run || typeof run !== 'object') return null;
  const snapshotValue = (run as { snapshot?: unknown }).snapshot;
  let snapshot: unknown = snapshotValue;
  if (typeof snapshot === 'string') {
    snapshot = safeParseJson<unknown>(snapshot, null);
    if (snapshot === null) return null;
  }
  if (!snapshot || typeof snapshot !== 'object') return null;
  const state = (snapshot as { value?: unknown }).value;
  const parsed = MutationRunContextSchema.safeParse(state);
  if (!parsed.success) return null;

  // With `exactOptionalPropertyTypes`, Zod's optional field is typed as
  // `systemAction?: SystemActionId | undefined`, while the trusted context
  // interface models omission as a genuinely absent property. Normalize the
  // parsed value so callers never receive an explicit `undefined` field.
  if (parsed.data.systemAction === undefined) {
    const { systemAction: _systemAction, ...context } = parsed.data;
    return context;
  }
  return {
    userId: parsed.data.userId,
    threadId: parsed.data.threadId,
    mutation: parsed.data.mutation,
    systemAction: parsed.data.systemAction,
    inputDigest: parsed.data.inputDigest,
    confirmation: parsed.data.confirmation,
  };
}
