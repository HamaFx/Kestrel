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

export interface MastraUsageLike {
  inputTokens?: number | undefined;
  outputTokens?: number | undefined;
  promptTokens?: number | undefined;
  completionTokens?: number | undefined;
}

export interface MastraGenerationResultLike {
  text: string;
  totalUsage?: MastraUsageLike;
  usage?: MastraUsageLike;
  toolCalls?: readonly unknown[];
  steps?: readonly unknown[];
}

export interface MastraGenerationStats {
  inputTokens: number;
  outputTokens: number;
  toolCalls: number;
  steps: number;
}

export function getMastraGenerationStats(result: {
  totalUsage?: MastraUsageLike;
  usage?: MastraUsageLike;
  toolCalls?: readonly unknown[];
  steps?: readonly unknown[];
}): MastraGenerationStats {
  const usage = result.totalUsage ?? result.usage ?? {};
  return {
    inputTokens: usage.inputTokens ?? usage.promptTokens ?? 0,
    outputTokens: usage.outputTokens ?? usage.completionTokens ?? 0,
    toolCalls: result.toolCalls?.length ?? 0,
    steps: result.steps?.length ?? 0,
  };
}

export type MastraRunOutcome = 'success' | 'failed' | 'cancelled';

export function mastraOutcomeForError(error: unknown, signal?: AbortSignal): MastraRunOutcome {
  if (signal?.aborted) return 'cancelled';
  if (error instanceof Error && error.name === 'AbortError') return 'cancelled';
  return 'failed';
}

export function outputLength(value: unknown): number | null {
  if (value === undefined) return null;
  try {
    return JSON.stringify(value)?.length ?? null;
  } catch {
    return null;
  }
}

export function errorCodeForMastra(error: unknown): string {
  if (error instanceof Error && error.name.trim().length > 0) return error.name;
  return 'UnknownError';
}
