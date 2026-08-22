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

import { logErrorContext } from '@kestrel/shared/logger';

import { completeStep, recordStep } from '../diagnostics';

export function startResearchStage(name: string, metadata: Record<string, unknown>): void {
  recordStep(`mastra_xauusd_research.${name}`, metadata);
}

export function completeResearchStage(
  name: string,
  status: 'completed' | 'failed',
  metadata: Record<string, unknown>,
): void {
  completeStep(`mastra_xauusd_research.${name}`, status, undefined, metadata);
}

export function recordResearchStageFailure(
  name: string,
  error: unknown,
  metadata: Record<string, unknown>,
): void {
  completeResearchStage(name, 'failed', metadata);
  logErrorContext(error, `mastra_xauusd_research.${name}`, metadata, 'ai');
}

export function warningForResearchFailure(scope: string): string {
  return `${scope} could not be collected; numeric claims for this scope are blocked.`;
}

export function uniqueResearchValues(values: readonly string[]): string[] {
  return [...new Set(values)];
}
