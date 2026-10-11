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

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

import { z } from 'zod';

export const MastraMutationNameSchema = z.enum([
  'set_alert',
  'log_journal',
  'share_snapshot',
  'run_system_action',
]);

export type MastraMutationName = z.infer<typeof MastraMutationNameSchema>;

/**
 * Closed registry for operator actions. Mutation extraction and confirmation
 * must validate against this registry before any executor is reached; an
 * LLM-provided action string is never an authorization decision.
 */
export const SYSTEM_ACTION_REGISTRY = {
  resonance_sync: {
    requiresAdmin: true,
    timeoutMs: 120_000,
    auditLabel: 'system.resonance_sync',
  },
} as const;

export type SystemActionId = keyof typeof SYSTEM_ACTION_REGISTRY;

export function isRegisteredSystemAction(action: string): action is SystemActionId {
  return Object.prototype.hasOwnProperty.call(SYSTEM_ACTION_REGISTRY, action);
}

export function assertRegisteredSystemAction(action: string): asserts action is SystemActionId {
  if (!isRegisteredSystemAction(action)) {
    const error = new Error(`Unregistered system action: ${action}`);
    error.name = 'MastraMutationPolicyError';
    Object.assign(error, { code: 'MASTRA_MUTATION_UNREGISTERED_ACTION' });
    throw error;
  }
}

/**
 * Enforce the authorization policy for a registered system action.
 * Registration and authorization are separate checks: a known action is not
 * executable unless the current server-side caller satisfies its policy.
 */
export function assertSystemActionAuthorized(
  action: string,
  isAdmin: boolean,
): asserts action is SystemActionId {
  assertRegisteredSystemAction(action);
  if (SYSTEM_ACTION_REGISTRY[action].requiresAdmin && !isAdmin) {
    throw mutationPolicyError('admin-required');
  }
}

export interface VerifiedMutationApproval {
  /** Server-issued, durable approval identity. */
  approvalId: string;
  userId: string;
  threadId: string;
  mutation: MastraMutationName;
  /** Digest of the exact mutation input approved by the user. */
  inputDigest: string;
  expiresAt: number;
  /** Raw token presented by the user for this exact approval. */
  confirmationToken: string;
  /** HMAC-backed proof persisted by the draft workflow. */
  confirmation: StoredMutationConfirmation;
}

export interface MastraMutationRequest {
  mutation: MastraMutationName;
  userId: string;
  threadId: string;
  /** Current server-side authorization state; never sourced from the client. */
  isAdmin?: boolean;
  /** Registered system action bound to the approval proof. */
  systemAction?: string;
  /** Server-produced approval; a client boolean is intentionally not accepted. */
  approval: VerifiedMutationApproval;
}

export interface MastraMutationVerificationOptions {
  /** Secret/clock overrides are available only to trusted server composition edges and tests. */
  secret?: string | undefined;
  now?: number;
}

export type MastraMutationDecision =
  | { allowed: true; mutation: MastraMutationName }
  | {
      allowed: false;
      mutation: MastraMutationName;
      reason:
        | 'disabled'
        | 'confirmation-required'
        | 'invalid-context'
        | 'token-expired'
        | 'token-invalid'
        | 'admin-required'
        | 'unregistered-action';
    };

/**
 * Mastra writes are deliberately separate from the legacy AI SDK tools.
 * The flag is false unless an operator explicitly enables it, and the
 * request must carry a server-issued confirmation decision as well.
 */
export function evaluateMastraMutation(
  request: MastraMutationRequest,
  verification: MastraMutationVerificationOptions = {},
): MastraMutationDecision {
  if (!request.userId || !request.threadId) {
    return { allowed: false, mutation: request.mutation, reason: 'invalid-context' };
  }
  if (process.env.ENABLE_MASTRA_MUTATIONS !== 'true') {
    return { allowed: false, mutation: request.mutation, reason: 'disabled' };
  }
  if (request.mutation === 'run_system_action') {
    if (!request.systemAction || !isRegisteredSystemAction(request.systemAction)) {
      return { allowed: false, mutation: request.mutation, reason: 'unregistered-action' };
    }
    if (SYSTEM_ACTION_REGISTRY[request.systemAction].requiresAdmin && request.isAdmin !== true) {
      return { allowed: false, mutation: request.mutation, reason: 'admin-required' };
    }
  }
  const approval = request.approval;
  if (
    approval.approvalId.length === 0 ||
    approval.userId !== request.userId ||
    approval.threadId !== request.threadId ||
    approval.mutation !== request.mutation ||
    !/^[a-f0-9]{64}$/.test(approval.inputDigest) ||
    approval.expiresAt !== approval.confirmation.expiresAt ||
    approval.confirmation.inputDigest !== approval.inputDigest
  ) {
    return { allowed: false, mutation: request.mutation, reason: 'confirmation-required' };
  }
  const now = verification.now ?? Date.now();
  if (now > approval.expiresAt) {
    return { allowed: false, mutation: request.mutation, reason: 'token-expired' };
  }
  try {
    if (
      !verifyMutationConfirmationToken({
        token: approval.confirmationToken,
        stored: approval.confirmation,
        mutation: request.mutation,
        userId: request.userId,
        inputDigest: approval.inputDigest,
        secret: verification.secret,
        now,
      })
    ) {
      return { allowed: false, mutation: request.mutation, reason: 'token-invalid' };
    }
  } catch {
    return { allowed: false, mutation: request.mutation, reason: 'token-invalid' };
  }
  return { allowed: true, mutation: request.mutation };
}

/**
 * Draft-time gate: a mutation may only begin its confirmation flow when the
 * feature is enabled and the context is valid. Confirmation is intentionally
 * NOT required here — the draft is the start of the confirmation flow.
 */
export function assertMastraMutationDraftAllowed(request: {
  mutation: MastraMutationName;
  userId: string;
  threadId: string;
}): void {
  if (!request.userId || !request.threadId) {
    throw mutationPolicyError('invalid-context');
  }
  if (process.env.ENABLE_MASTRA_MUTATIONS !== 'true') {
    throw mutationPolicyError('disabled');
  }
}

export function assertMastraMutationAllowed(
  request: MastraMutationRequest,
  verification?: MastraMutationVerificationOptions,
): void {
  const decision = evaluateMastraMutation(request, verification);
  if (decision.allowed) return;

  if (!decision.allowed) {
    throw mutationPolicyError(decision.reason);
  }
}

function mutationPolicyError(
  reason:
    | Extract<MastraMutationDecision, { allowed: false }>['reason']
    | 'token-expired'
    | 'token-invalid',
): Error {
  const error = new Error(
    reason === 'disabled'
      ? 'Mastra mutations are disabled by policy.'
      : reason === 'confirmation-required'
        ? 'Mastra mutation requires explicit server-side confirmation.'
        : reason === 'token-expired'
          ? 'Mastra mutation confirmation token has expired.'
          : reason === 'token-invalid'
            ? 'Mastra mutation confirmation token is invalid.'
            : reason === 'admin-required'
              ? 'Administrator authorization is required for this system action.'
              : reason === 'unregistered-action'
                ? 'The requested system action is not registered.'
                : 'Mastra mutation context is invalid.',
  );
  error.name = 'MastraMutationPolicyError';
  Object.assign(error, {
    code: `MASTRA_MUTATION_${reason.toUpperCase().replaceAll('-', '_')}`,
  });
  return error;
}

// ---------------------------------------------------------------------------
// Phase 7 — stateful confirmation tokens.
//
// The workflow issues a single-use, expiring confirmation token at the draft
// step and stores only its HMAC in the persisted run state. The resume step
// verifies the presented token against the stored digest (timing-safe) and
// its expiry before any write executes. Single-use is enforced by the
// workflow run itself: a resumed run leaves the suspended state, so the same
// run cannot be resumed twice with the same token.
// ---------------------------------------------------------------------------

export const MUTATION_TOKEN_TTL_MS = 15 * 60 * 1000; // 15 minutes default

/** Raw token handed to the client (random, high-entropy). */
export interface MutationConfirmationToken {
  token: string;
  expiresAt: number;
}

/** What the workflow persists in run state — never the raw token. */
export interface StoredMutationConfirmation {
  digest: string;
  expiresAt: number;
  /** Digest of the exact mutation input bound into the HMAC proof. */
  inputDigest: string;
}

export interface IssueConfirmationTokenOptions {
  mutation: MastraMutationName;
  userId: string;
  /** HMAC secret. Defaults to `AUTH_COOKIE_SECRET` from env. */
  secret?: string;
  ttlMs?: number;
  now?: number;
}

export function issueMutationConfirmationToken(
  options: IssueConfirmationTokenOptions,
): MutationConfirmationToken {
  // Ensures the secret is configured (throws in production when absent).
  confirmationSecret(options.secret);
  const now = options.now ?? Date.now();
  const ttlMs = options.ttlMs ?? MUTATION_TOKEN_TTL_MS;
  const token = randomBytes(32).toString('base64url');
  return { token, expiresAt: now + ttlMs };
}

/** Compute the persisted digest for a token (store this, not the token). */
export function storedConfirmationForToken(
  token: string,
  options: Omit<IssueConfirmationTokenOptions, 'ttlMs' | 'now'> & {
    expiresAt: number;
    inputDigest?: string;
  },
): StoredMutationConfirmation {
  const secret = confirmationSecret(options.secret);
  const inputDigest = options.inputDigest ?? '';
  return {
    digest: hmacDigest(
      secret,
      `${token}:${options.mutation}:${options.userId}:${inputDigest}:${options.expiresAt}`,
    ),
    expiresAt: options.expiresAt,
    inputDigest,
  };
}

export interface VerifyConfirmationTokenOptions {
  /** Raw token presented by the client on resume. */
  token: string;
  /** Digest + expiry persisted in run state by the draft step. */
  stored: StoredMutationConfirmation;
  mutation: MastraMutationName;
  userId: string;
  inputDigest?: string;
  /** Trusted server-side secret override; omitted callers use AUTH_COOKIE_SECRET. */
  secret?: string | undefined;
  now?: number;
}

/**
 * Timing-safe verification of a presented confirmation token against the
 * stored digest + expiry. Returns false for any mismatch (never throws), so
 * the resume step fails closed on replay, expiry, or cross-run token reuse.
 */
export function verifyMutationConfirmationToken(options: VerifyConfirmationTokenOptions): boolean {
  const secret = confirmationSecret(options.secret);
  const now = options.now ?? Date.now();
  if (now > options.stored.expiresAt) return false;
  const expected = hmacDigest(
    secret,
    `${options.token}:${options.mutation}:${options.userId}:${options.inputDigest ?? ''}:${options.stored.expiresAt}`,
  );
  return timingSafeEqualHex(expected, options.stored.digest);
}

export function confirmationSecret(explicit?: string): string {
  const secret = explicit ?? process.env.AUTH_COOKIE_SECRET ?? '';
  if (secret.length < 32) {
    // Fail closed: without a strong secret, confirmation tokens cannot be
    // issued. (Dev/test callers may pass an explicit secret.)
    if (process.env.NODE_ENV !== 'production' && explicit) return explicit;
    throw new Error(
      'AUTH_COOKIE_SECRET (>= 32 chars) is required for mutation confirmation tokens.',
    );
  }
  return secret;
}

function hmacDigest(secret: string, value: string): string {
  return createHmac('sha256', secret).update(value, 'utf8').digest('hex');
}

/** Constant-time hex comparison (both sides hex-decoded). */
function timingSafeEqualHex(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, 'hex');
  const bBuf = Buffer.from(b, 'hex');
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}
