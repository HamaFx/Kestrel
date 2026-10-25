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

// Draft step: validate, issue a single-use token, and suspend.

import { randomBytes } from 'node:crypto';

import { createStep } from '@mastra/core/workflows';

import {
  assertMastraMutationAllowed,
  assertMastraMutationDraftAllowed,
  assertSystemActionAuthorized,
  MUTATION_TOKEN_TTL_MS,
  storedConfirmationForToken,
  verifyMutationConfirmationToken,
} from '../mutation/mutation-policy';
import {
  ConfirmedInputSchema,
  humanSummary,
  mutationDisplayName,
  mutationInputDigest,
  MutationInputSchema,
  mutationPolicyError,
  MutationResumeSchema,
  MutationRunContextSchema,
  MutationSuspendPayloadSchema,
  MutationWorkflowStateSchema,
  type MutationState,
  type MutationWorkflowDeps,
} from './mutation-schemas';

export function createMutationDraftStep(deps: MutationWorkflowDeps) {
  const mutation = deps.mutation;
  const secret = deps.secret;
  const now = deps.now ?? Date.now;
  return createStep({
    id: 'draft',
    inputSchema: MutationInputSchema,
    outputSchema: ConfirmedInputSchema,
    resumeSchema: MutationResumeSchema,
    suspendSchema: MutationSuspendPayloadSchema,
    stateSchema: MutationWorkflowStateSchema,
    execute: async ({ inputData, resumeData, suspend, state, setState, runId }) => {
      // First pass — validate + dry-run + issue token + suspend.
      if (!resumeData) {
        if (inputData.kind === 'run_system_action') {
          assertSystemActionAuthorized(inputData.action, deps.isAdmin === true);
        }
        // Draft gate before any state is written: enabled + valid context.
        // Confirmation is intentionally NOT required here — this is the start
        // of the confirmation flow.
        assertMastraMutationDraftAllowed({
          mutation,
          userId: deps.userId,
          threadId: deps.threadId,
        });

        const token = randomBytes(32).toString('base64url');
        const expiresAt = now() + (deps.ttlMs ?? MUTATION_TOKEN_TTL_MS);
        const inputDigest = mutationInputDigest(inputData);
        const storedOptions: Parameters<typeof storedConfirmationForToken>[1] = {
          mutation,
          userId: deps.userId,
          expiresAt,
          inputDigest,
        };
        if (secret) storedOptions.secret = secret;
        const stored = storedConfirmationForToken(token, storedOptions);
        const systemAction = inputData.kind === 'run_system_action' ? inputData.action : undefined;
        await setState({
          userId: deps.userId,
          threadId: deps.threadId,
          mutation,
          ...(systemAction ? { systemAction } : {}),
          inputDigest,
          confirmation: {
            digest: stored.digest,
            expiresAt: stored.expiresAt,
            inputDigest: stored.inputDigest,
          },
        });

        return suspend({
          mutation,
          summary: humanSummary(inputData),
          runId,
          expiresAt,
          confirmationToken: token,
          confirmLabel: `Confirm ${mutationDisplayName(mutation)}`,
          cancelLabel: 'Cancel',
        });
      }

      // Resume pass — confirm: timing-safe token + expiry + policy.
      if (inputData.kind === 'run_system_action') {
        assertSystemActionAuthorized(inputData.action, deps.isAdmin === true);
      }
      const persisted = MutationRunContextSchema.safeParse(state);
      if (!persisted.success || persisted.data.mutation !== mutation) {
        throw mutationPolicyError('token-invalid');
      }
      if (persisted.data.userId !== deps.userId || persisted.data.threadId !== deps.threadId) {
        const error = new Error('Mutation confirmation context does not match the drafted run.');
        error.name = 'MastraMutationContextError';
        throw error;
      }
      if (mutationInputDigest(inputData) !== persisted.data.inputDigest) {
        const error = new Error('Persisted mutation input has changed.');
        error.name = 'MastraMutationContextError';
        throw error;
      }
      if (
        mutation === 'run_system_action' &&
        (inputData.kind !== 'run_system_action' || persisted.data.systemAction !== inputData.action)
      ) {
        const error = new Error('Persisted system action has changed.');
        error.name = 'MastraMutationContextError';
        throw error;
      }
      const stored = persisted.data.confirmation;
      const verifyOptions: Parameters<typeof verifyMutationConfirmationToken>[0] = {
        token: resumeData.confirmationToken,
        stored,
        mutation,
        userId: deps.userId,
        inputDigest: persisted.data.inputDigest,
        now: now(),
      };
      if (secret) verifyOptions.secret = secret;
      const tokenOk = verifyMutationConfirmationToken(verifyOptions);
      if (!tokenOk) {
        throw mutationPolicyError(now() > stored.expiresAt ? 'token-expired' : 'token-invalid');
      }
      assertMastraMutationAllowed(
        {
          mutation,
          userId: deps.userId,
          threadId: (state as MutationState | undefined)?.threadId ?? deps.threadId,
          isAdmin: deps.isAdmin === true,
          ...(persisted.data.systemAction ? { systemAction: persisted.data.systemAction } : {}),
          approval: {
            approvalId: runId,
            userId: deps.userId,
            threadId: (state as MutationState | undefined)?.threadId ?? deps.threadId,
            mutation,
            inputDigest: persisted.data.inputDigest,
            expiresAt: stored.expiresAt,
            confirmationToken: resumeData.confirmationToken,
            confirmation: stored,
          },
        },
        { secret, now: now() },
      );

      return { confirmed: true as const, input: inputData };
    },
  });
}
