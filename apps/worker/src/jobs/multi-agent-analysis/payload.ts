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

// Queue-payload and model-snapshot helpers for the durable full-analysis
// worker: budget-admission error classification, snapshot-based model
// resolution, and reconstruction of the enqueue-time user message.

import { resolveMastraModel } from '@kestrel/ai';
import type { FullAnalysisPayload } from '@kestrel/ai/mastra-v2';
import type { UIMessage } from 'ai';

export function isBudgetExceededError(error: unknown): error is { spent: number; max: number } {
  return (
    error instanceof Error &&
    (error as { code?: unknown }).code === 'BUDGET_EXCEEDED' &&
    Number.isFinite((error as { spent?: unknown }).spent) &&
    Number.isFinite((error as { max?: unknown }).max)
  );
}

export function resolveSnapshotModel(
  settings: Parameters<typeof resolveMastraModel>[0]['settings'],
  env: Parameters<typeof resolveMastraModel>[0]['env'],
  snapshot: NonNullable<FullAnalysisPayload['modelSnapshot']>,
) {
  return resolveMastraModel({
    purpose: 'worker',
    settings,
    env,
    domain: 'technical',
    snapshot,
  });
}

/**
 * Reconstruct the enqueue-time user message for a durable full-analysis run.
 *
 * Audit 2026-10-31 (R7): the payload carries the user's original chat parts,
 * whose images point at the owner-authorised `/api/uploads/...` proxy (or a
 * legacy public Supabase URL). Those references are kept verbatim: this
 * message is persisted by `appendUserMessage` and backfilled into Mastra
 * memory, so it must never carry inline bytes. The bytes are produced later,
 * at the provider boundary, by the image middleware attached to every model
 * (`packages/ai/src/media/image-model-middleware.ts`); Mastra's pre-flight
 * downloader is told those URL shapes are provider-handled, so it hands the
 * reference through to the middleware instead of fetching it anonymously.
 *
 * Ordering: persist reference -> memory backfill keeps reference ->
 * provider prompt inlines bytes (transient, never stored).
 */
export function userMessageFromPayload(payload: FullAnalysisPayload): UIMessage {
  const storedParts = Array.isArray(payload.userMessageParts) ? payload.userMessageParts : [];
  const hasTextPart = storedParts.some(
    (part) =>
      typeof part === 'object' && part !== null && (part as { type?: unknown }).type === 'text',
  );
  const parts = hasTextPart
    ? storedParts
    : [...storedParts, { type: 'text', text: payload.userMessageText }];
  return {
    id: crypto.randomUUID(),
    role: 'user',
    parts: parts as UIMessage['parts'],
  } as UIMessage;
}
