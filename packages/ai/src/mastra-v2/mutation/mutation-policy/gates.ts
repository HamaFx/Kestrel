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

// Mutation gates (DEC-05 split of mutation-policy.ts). The draft gate starts a
// confirmation flow; the execute gate requires a server-issued approval whose
// HMAC token verifies against the persisted digest.

import {
  isCoreMutationName,
  isRegisteredSystemAction,
  pluginWriteTool,
  SYSTEM_ACTION_REGISTRY,
  type MastraMutationName,
  type SystemActionId,
} from './names';
import { verifyMutationConfirmationToken, type StoredMutationConfirmation } from './tokens';

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
  /** Installed plugin ids resolved server-side for this user. */
  installedPlugins?: readonly string[];
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
        | 'unregistered-action'
        | 'unregistered-mutation'
        | 'plugin-not-installed';
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
  if (isCoreMutationName(request.mutation)) {
    if (request.mutation === 'run_system_action') {
      if (!request.systemAction || !isRegisteredSystemAction(request.systemAction)) {
        return { allowed: false, mutation: request.mutation, reason: 'unregistered-action' };
      }
      if (SYSTEM_ACTION_REGISTRY[request.systemAction].requiresAdmin && request.isAdmin !== true) {
        return { allowed: false, mutation: request.mutation, reason: 'admin-required' };
      }
    }
  } else {
    // Plugin writes are valid only when the capability is registered as a
    // write tool and the user actually has the owning plugin installed.
    const pluginTool = pluginWriteTool(request.mutation);
    if (!pluginTool) {
      return { allowed: false, mutation: request.mutation, reason: 'unregistered-mutation' };
    }
    if (!request.installedPlugins?.includes(pluginTool.pluginId)) {
      return { allowed: false, mutation: request.mutation, reason: 'plugin-not-installed' };
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
  installedPlugins?: readonly string[];
}): void {
  if (!request.userId || !request.threadId) {
    throw mutationPolicyError('invalid-context');
  }
  if (process.env.ENABLE_MASTRA_MUTATIONS !== 'true') {
    throw mutationPolicyError('disabled');
  }
  if (!isCoreMutationName(request.mutation)) {
    const pluginTool = pluginWriteTool(request.mutation);
    if (!pluginTool) throw mutationPolicyError('unregistered-mutation');
    if (!request.installedPlugins?.includes(pluginTool.pluginId)) {
      throw mutationPolicyError('plugin-not-installed');
    }
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
                : reason === 'unregistered-mutation'
                  ? 'The requested mutation is not a registered write tool.'
                  : reason === 'plugin-not-installed'
                    ? 'The plugin that owns this mutation is not installed for the user.'
                    : 'Mastra mutation context is invalid.',
  );
  error.name = 'MastraMutationPolicyError';
  Object.assign(error, {
    code: `MASTRA_MUTATION_${reason.toUpperCase().replaceAll('-', '_')}`,
  });
  return error;
}
