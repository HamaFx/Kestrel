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

// Mutation confirmation workflow factory + run driver.
//
//   draft (validate + token + suspend) → execute (audited write) → notify
//
// The write executor is injected by the composition edge; this module never
// imports the database.

import { Workflow } from '@mastra/core/workflows';

import { logWorkflowEnd, logWorkflowError, logWorkflowStart } from '../logger';
import { runTracingOptions } from '../telemetry';
import { createMutationDraftStep } from './mutation-draft-step';
import { createMutationExecuteStep } from './mutation-execute-step';
import {
  MutationOutputSchema,
  WorkflowInputSchema,
  type MutationInput,
  type MutationOutput,
  type MutationResumeInput,
  type MutationSuspendPayload,
  type MutationWorkflowDeps,
} from './mutation-schemas';

export * from './mutation-schemas';

type ChainStep = Parameters<Workflow['then']>[0];

export function createMutationWorkflow(deps: MutationWorkflowDeps): Workflow {
  const mutation = deps.mutation;

  const draftStep = createMutationDraftStep(deps);
  const [executeStep, notifyStep] = createMutationExecuteStep(deps);

  return new Workflow({
    id: `mutation-${mutation}`,
    inputSchema: WorkflowInputSchema,
    outputSchema: MutationOutputSchema,
    ...(deps.mastra ? { mastra: deps.mastra } : {}),
  })
    .then(draftStep as unknown as ChainStep)
    .then(executeStep as unknown as ChainStep)
    .then(notifyStep as unknown as ChainStep)
    .commit() as unknown as Workflow;
}

// --- driver -----------------------------------------------------------------

export interface RunMutationResult {
  status: 'suspended' | 'executed';
  runId: string;
  suspendPayload?: MutationSuspendPayload;
  output?: MutationOutput;
}

/** Cancel a drafted mutation without entering its confirmation branch. */
export async function cancelMutationWorkflow(
  workflow: ReturnType<typeof createMutationWorkflow>,
  options: { runId: string; userId?: string },
): Promise<void> {
  const createRunOptions: { runId: string; resourceId?: string } = { runId: options.runId };
  if (options.userId) createRunOptions.resourceId = options.userId;
  const run = await workflow.createRun(createRunOptions);
  await run.cancel();
}

/**
 * Start (or resume) a mutation run.
 *
 * - `resumeData` absent → starts the workflow with `input`; returns the
 *   suspension payload (confirmation card data) with status `suspended`.
 * - `resumeData` present → resumes the run by id; the draft step's resume
 *   branch re-validates the token, then execute + notify run with the input
 *   persisted in the run snapshot. Returns the executed output.
 */
export async function runMutationWorkflow(
  workflow: ReturnType<typeof createMutationWorkflow>,
  options: {
    input?: MutationInput;
    runId?: string;
    resumeData?: MutationResumeInput;
    /** User id for trace linkage (fallback to the workflow's deps user). */
    userId?: string;
    threadId?: string;
  },
): Promise<RunMutationResult> {
  const createRunOptions: { runId?: string; resourceId?: string } = {};
  if (options.runId) createRunOptions.runId = options.runId;
  if (options.userId) createRunOptions.resourceId = options.userId;
  const run = await workflow.createRun(createRunOptions);
  const runId = run.runId;
  const startedAt = Date.now();
  const runLog = {
    runId,
    workflowId: `mutation-${workflowMutationKind(workflow)}`,
    stepId: options.resumeData ? 'confirm' : 'draft',
  };

  if (options.resumeData) {
    if (!options.runId) {
      throw new Error('runId is required to resume a mutation run');
    }
    logWorkflowStart({
      ...runLog,
      message: 'Mutation run resuming for confirmation',
    });
    try {
      const result = await run.resume({
        step: 'draft',
        resumeData: options.resumeData,
        ...(options.userId && options.threadId
          ? {
              tracingOptions: runTracingOptions({
                runId,
                userId: options.userId,
                threadId: options.threadId,
                kind: `mutation-${workflowMutationKind(workflow)}`,
                tags: ['mutation'],
              }),
            }
          : {}),
      });
      if (result.status === 'success') {
        // The workflow's terminal step returns the MutationOutput; it is not
        // surfaced on the top-level result, so read it from the notify step.
        const output = extractMutationOutput(result);
        logWorkflowEnd({ ...runLog, startedAt, message: 'Mutation run executed' });
        return { status: 'executed', runId, output };
      }
      if (result.status === 'failed' && result.error) {
        throw result.error;
      }
      throw new Error(`Mutation resume failed with status ${result.status}`);
    } catch (error) {
      logWorkflowError({ ...runLog, startedAt, message: 'Mutation confirmation failed', error });
      throw error;
    }
  }

  if (!options.input) {
    throw new Error('input is required to start a mutation run');
  }
  logWorkflowStart({
    ...runLog,
    message: 'Mutation run drafting for confirmation',
    meta: { mutation: options.input.kind },
  });
  try {
    const result = await run.start({
      inputData: options.input,
      ...(options.userId && options.threadId
        ? {
            tracingOptions: runTracingOptions({
              runId,
              userId: options.userId,
              threadId: options.threadId,
              kind: `mutation-${workflowMutationKind(workflow)}`,
              tags: ['mutation'],
            }),
          }
        : {}),
    });
    if (result.status === 'suspended') {
      const suspended = result.suspended[0];
      const stepKey = suspended?.[0];
      const payload =
        stepKey !== undefined
          ? (result.steps[stepKey]?.suspendPayload as MutationSuspendPayload | undefined)
          : undefined;
      const runResult: RunMutationResult = { status: 'suspended', runId };
      if (payload) runResult.suspendPayload = payload;
      return runResult;
    }
    if (result.status === 'failed' && result.error) {
      // Propagate the underlying policy error (disabled, invalid context, ...)
      // so callers can react to the actual reason instead of a generic wrapper.
      throw toError(result.error);
    }
    throw new Error(`Mutation run did not suspend as expected (status ${result.status})`);
  } catch (error) {
    logWorkflowError({ ...runLog, startedAt, message: 'Mutation draft failed', error });
    throw error;
  }
}

/** Read the mutation kind from a built workflow (used for log identity). */
function workflowMutationKind(workflow: ReturnType<typeof createMutationWorkflow>): string {
  const id = (workflow as unknown as { id?: string }).id ?? '';
  return id.replace(/^mutation-/, '');
}

function toError(value: unknown): Error {
  if (value instanceof Error) return value;
  if (typeof value === 'object' && value !== null && 'message' in value) {
    const message = String((value as { message: unknown }).message);
    const error = new Error(message);
    if ('name' in value) error.name = String((value as { name: unknown }).name);
    if ('code' in value) Object.assign(error, { code: (value as { code: unknown }).code });
    return error;
  }
  return new Error(String(value));
}

/** Pull the notify-step output from a successful resume result. */
function extractMutationOutput(result: { steps: Record<string, unknown> }): MutationOutput {
  const stepResult = result.steps['notify'];
  const candidate = stepResult as { output?: unknown } | undefined;
  if (candidate && typeof candidate === 'object' && candidate.output !== undefined) {
    return MutationOutputSchema.parse(candidate.output);
  }
  throw new Error('Mutation resume succeeded but produced no output.');
}
