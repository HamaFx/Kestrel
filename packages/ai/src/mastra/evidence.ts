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

import { randomUUID } from 'node:crypto';

import type { EvidenceFreshness, EvidenceQuality } from './evidence-types';

export function createEvidenceId(kind: string, symbol: string, timeframe?: string): string {
  const scope = timeframe ? `${symbol.toLowerCase()}-${timeframe}` : symbol.toLowerCase();
  return `kestrel-${kind}-${scope}-${randomUUID()}`;
}

export function freshnessFromAge(ageMs: number | null, maxFreshMs: number): EvidenceFreshness {
  if (ageMs === null || !Number.isFinite(ageMs)) return 'unknown';
  return ageMs <= maxFreshMs ? 'fresh' : 'stale';
}

export function qualityFromWarnings(warnings: readonly string[]): EvidenceQuality {
  return warnings.length === 0 ? 'complete' : 'degraded';
}

export function requireXauusdUserContext(context: {
  requestContext?: { get: (key: string) => unknown };
}): { userId: string; runId: string; threadId?: string } {
  const userId = context.requestContext?.get('userId');
  const runId = context.requestContext?.get('runId');
  const threadId = context.requestContext?.get('threadId');

  if (typeof userId !== 'string' || userId.trim().length === 0) {
    throw new Error('Mastra XAUUSD tool requires an authenticated userId in request context');
  }
  if (typeof runId !== 'string' || runId.trim().length === 0) {
    throw new Error('Mastra XAUUSD tool requires a runId in request context');
  }

  if (threadId !== undefined && (typeof threadId !== 'string' || threadId.trim().length === 0)) {
    throw new Error('Mastra XAUUSD tool received an invalid threadId in request context');
  }

  return {
    userId,
    runId,
    ...(typeof threadId === 'string' ? { threadId } : {}),
  };
}
