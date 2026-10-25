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

// Execute + notify steps for the confirmed mutation.

import { createStep } from '@mastra/core/workflows';

import { assertSystemActionAuthorized } from '../mutation/mutation-policy';
import {
  ConfirmedInputSchema,
  humanSummary,
  mutationInputDigest,
  MutationOutputSchema,
  MutationRunContextSchema,
  type MutationWorkflowDeps,
} from './mutation-schemas';

export function createMutationExecuteStep(deps: MutationWorkflowDeps) {
  const mutation = deps.mutation;
  const now = deps.now ?? Date.now;
  const executeStep = createStep({
    id: 'execute',
    inputSchema: ConfirmedInputSchema,
    outputSchema: MutationOutputSchema,
    execute: async ({ inputData, runId, state }) => {
      if (inputData.input.kind === 'run_system_action') {
        assertSystemActionAuthorized(inputData.input.action, deps.isAdmin === true);
      }
      const inputDigest = mutationInputDigest(inputData.input);
      const approvalExpiresAt =
        MutationRunContextSchema.safeParse(state).data?.confirmation.expiresAt ?? now();
      const result = deps.executeAtomic
        ? await deps.executeAtomic(inputData.input, {
            runId,
            userId: deps.userId,
            threadId: deps.threadId,
            inputDigest,
            approvalId: runId,
            approvalExpiresAt,
          })
        : await deps.execute(inputData.input);
      const summary = humanSummary(inputData.input);
      if (!deps.executeAtomic && deps.writeAudit) {
        await deps.writeAudit(deps.userId, `mutation.${mutation}.executed`, {
          mutation,
          runId,
          threadId: deps.threadId,
          resultId: result.id,
          kind: inputData.input.kind,
          inputDigest,
        });
      }
      return {
        status: 'executed' as const,
        mutation,
        resultId: result.id,
        url: result.url ?? null,
        summary,
      };
    },
  });

  const notifyStep = createStep({
    id: 'notify',
    inputSchema: MutationOutputSchema,
    outputSchema: MutationOutputSchema,
    execute: async ({ inputData }) => inputData,
  });

  return [executeStep, notifyStep] as const;
}
