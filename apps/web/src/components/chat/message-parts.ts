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

// Pure message-part helpers shared by the renderer and actions.

import type { CitationWarningPart, FallbackPart, StreamToolState } from '@kestrel/shared';
import type { UIMessage } from 'ai';

import type { ToolPartState } from './parts/registry';

export function toPartState(state: StreamToolState): ToolPartState {
  if (state === 'output-available') return 'done';
  if (state === 'output-error') return 'error';
  return 'loading';
}

export function findEvidenceReplacement(parts: UIMessage['parts'] | undefined): string | null {
  if (!Array.isArray(parts)) return null;
  for (let i = parts.length - 1; i >= 0; i--) {
    const part = parts[i] as { type?: unknown; data?: { message?: unknown } } | undefined;
    if (
      part &&
      part.type === 'data-evidence-blocked' &&
      part.data &&
      typeof part.data.message === 'string' &&
      part.data.message.length > 0
    ) {
      return part.data.message;
    }
  }
  return null;
}

export function malformedFallback(label: string): FallbackPart {
  return {
    type: 'data-fallback',
    message: `Malformed ${label} part`,
  };
}

export function citationWarningFromVerify(verify: {
  caveats: string[];
  createdAt: number;
}): CitationWarningPart {
  return {
    type: 'data-citation-warning',
    unsupportedClaims: verify.caveats,
    toolsInvoked: [],
    stance: 'strict',
    createdAt: verify.createdAt,
    findings: verify.caveats.map((text) => ({ text, supported: false, supportingTool: null })),
  };
}

export function extractText(m: UIMessage): string {
  const replacement = findEvidenceReplacement(m.parts);
  if (replacement !== null) return replacement.trim();
  return m.parts
    .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
    .map((p) => p.text)
    .join('\n')
    .trim();
}
