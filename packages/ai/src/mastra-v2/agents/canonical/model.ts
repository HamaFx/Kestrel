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

// Model resolution for canonical chat (execution-plan pin wins).

import type { UserSettingsRow } from '@kestrel/db/schema';

import { resolveMastraExecutionModel, type ChatModelResolution } from '@ai/models/model';
import type { RoutingDecision } from '@ai/routing';

import { requireExecutionPlanModel, type ExecutionPlan } from '../../planning/execution-plan';
import type { RunMastraCanonicalChatArgs } from './types';

export function resolveCanonicalModel(
  settings: Pick<UserSettingsRow, 'aiApiKeys' | 'chatModel'>,
  env: RunMastraCanonicalChatArgs['env'],
  routing: RoutingDecision,
  modelOverride?: string | null,
  executionPlan?: ExecutionPlan,
): ChatModelResolution {
  const snapshot = executionPlan ? requireExecutionPlanModel(executionPlan) : undefined;
  return resolveMastraExecutionModel({
    purpose: 'canonical-chat',
    settings,
    env,
    domain: routing.domain === 'generic' ? 'summary' : routing.domain,
    ...(modelOverride !== undefined ? { modelOverride } : {}),
    ...(snapshot ? { snapshot } : {}),
  });
}
