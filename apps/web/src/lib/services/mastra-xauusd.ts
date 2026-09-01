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

// SPDX-License-Identifier: Apache-2.0

import 'server-only';

import {
  runXauusdMastra,
  runXauusdMastraConversation,
  type RunXauusdMastraArgs,
  type XauusdMastraRunResult,
  type XauusdResearchReport,
} from '@kestrel/ai/mastra';
import { getThread, getUserWithSettings } from '@kestrel/db';
import { notFound } from '@kestrel/shared';
import type { ExecutionPlan } from '@kestrel/ai/mastra';

import { getServerEnv } from '@/lib/env';

export interface RunMastraXauusdResearchInput {
  userId: string;
  threadId: string;
  runId: string;
  prompt: string;
  modelOverride?: string | null;
  signal?: AbortSignal;
  telemetryKind?: 'mastra_xauusd_poc';
  followup?: boolean;
  priorReport?: XauusdResearchReport | null;
  executionPlan?: ExecutionPlan;
  ledger?: import('@kestrel/ai').GenerationLedger;
}

type MastraXauusdRunner = (args: RunXauusdMastraArgs) => Promise<XauusdMastraRunResult>;

async function executeMastraXauusdTurn(
  input: RunMastraXauusdResearchInput,
  runner: MastraXauusdRunner,
): Promise<XauusdMastraRunResult> {
  const thread = await getThread(input.userId, input.threadId);
  if (!thread) throw notFound('Thread not found');

  const { settings } = await getUserWithSettings(input.userId);
  if (!settings) {
    throw new Error('User settings not found. Please complete onboarding.');
  }

  return runner({
    prompt: input.prompt,
    userId: input.userId,
    threadId: input.threadId,
    runId: input.runId,
    settings,
    env: getServerEnv(),
    ...(input.modelOverride !== undefined ? { modelOverride: input.modelOverride } : {}),
    ...(input.signal ? { signal: input.signal } : {}),
    ...(input.telemetryKind ? { telemetryKind: input.telemetryKind } : {}),
    ...(input.followup ? { followup: true } : {}),
    ...(input.priorReport ? { priorReport: input.priorReport } : {}),
    ...(input.executionPlan ? { executionPlan: input.executionPlan } : {}),
    ...(input.ledger ? { ledger: input.ledger } : {}),
  });
}

export function runMastraXauusdResearch(
  input: RunMastraXauusdResearchInput,
): Promise<XauusdMastraRunResult> {
  return executeMastraXauusdTurn(input, runXauusdMastra);
}

export function runMastraXauusdConversation(
  input: RunMastraXauusdResearchInput,
): Promise<XauusdMastraRunResult> {
  return executeMastraXauusdTurn(input, runXauusdMastraConversation);
}
