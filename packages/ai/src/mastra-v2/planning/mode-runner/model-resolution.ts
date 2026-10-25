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

// BYOK model resolution for mode runs, including the per-committee-agent
// top-tier picks (audit plan §3.1).

import { readFeatureFlag } from '@kestrel/shared';

import type { createCommitteeWorkflow } from '@ai/committee/workflow';
import type { ResolveModelEnv } from '@ai/models/env-factory';
import { resolveMastraExecutionModel, type ChatModelResolution } from '@ai/models/model';

import { requireExecutionPlanModel, type ExecutionPlan } from '../execution-plan';
import type { MastraModeSettings } from './types';

export function resolveMastraModeModel(
  settings: MastraModeSettings,
  env: ResolveModelEnv,
  modelOverride?: string | null,
  executionPlan?: ExecutionPlan,
): ChatModelResolution {
  const snapshot = executionPlan ? requireExecutionPlanModel(executionPlan) : undefined;
  return resolveMastraExecutionModel({
    purpose: 'mode',
    settings,
    env,
    domain: 'technical',
    ...(modelOverride !== undefined ? { modelOverride } : {}),
    ...(snapshot ? { snapshot } : {}),
  });
}

/**
 * Audit plan §3.1 (Q1: quality always) — resolve per-committee-agent models
 * from the user's `agentModelOverrides` (or `MASTRA_COMMITTEE_MODELS` env
 * JSON). Every pick is a user/operator-chosen top-tier model — this resolver
 * NEVER downgrades to a cheaper tier. Gated by `PHASE3_MODEL_DIVERSITY`
 * (default off; rollback is one env var). Unresolvable picks fall back to
 * the run's primary top-tier model by returning null.
 */
export function committeeModelResolver(
  settings: MastraModeSettings,
  env: ResolveModelEnv,
): NonNullable<Parameters<typeof createCommitteeWorkflow>[0]['resolveModelForAgent']> | undefined {
  if (!readFeatureFlag('PHASE3_MODEL_DIVERSITY')) return undefined;

  let envOverrides: Record<string, string> = {};
  const rawEnvModels = process.env.MASTRA_COMMITTEE_MODELS;
  if (rawEnvModels) {
    try {
      const parsed: unknown = JSON.parse(rawEnvModels);
      if (parsed && typeof parsed === 'object') {
        envOverrides = Object.fromEntries(
          Object.entries(parsed as Record<string, unknown>).filter(
            (entry): entry is [string, string] => typeof entry[1] === 'string',
          ),
        );
      }
    } catch (error) {
      // A malformed env config must never break the run.
      void error;
    }
  }

  const pickFor = (
    agent: 'technical' | 'fundamental' | 'risk' | 'sentiment' | 'fusion',
  ): string | undefined => {
    const key = agent === 'fusion' ? 'decision' : agent;
    return settings.agentModelOverrides?.[key] ?? envOverrides[key];
  };

  const allAgents = ['technical', 'fundamental', 'risk', 'sentiment', 'fusion'] as const;
  if (!allAgents.some((agent) => pickFor(agent))) return undefined;

  return (agent) => {
    const pick = pickFor(agent);
    if (!pick) return null;
    try {
      return resolveMastraExecutionModel({
        purpose: 'mode',
        settings,
        env,
        domain: 'technical',
        modelOverride: pick,
      });
    } catch {
      // The picked model is unavailable (e.g. BYOK key removed); fall back
      // to the primary top-tier model for this agent — never a cheap tier.
      return null;
    }
  };
}
