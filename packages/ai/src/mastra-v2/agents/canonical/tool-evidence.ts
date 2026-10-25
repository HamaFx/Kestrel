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

// Tool-call/evidence extraction from Mastra message parts.

import type { MastraToolInvocationPart } from '../xauusd/legacy-tool-adapter';

export function extractToolNames(messages: readonly unknown[] | undefined): string[] {
  if (!messages) return [];
  const names = new Set<string>();
  for (const message of messages) {
    if (!message || typeof message !== 'object') continue;
    const content = (message as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (!part || typeof part !== 'object') continue;
      const candidate = part as { type?: unknown; toolName?: unknown };
      if (candidate.type === 'tool-call' && typeof candidate.toolName === 'string') {
        const rawName = candidate.toolName.startsWith('kestrel-')
          ? candidate.toolName.slice('kestrel-'.length)
          : candidate.toolName;
        names.add(rawName);
      }
    }
  }
  return [...names];
}

/**
 * Audit plan §1.3 — the evidence gate must check the values a market-data
 * tool actually returned, not merely that a market-sounding tool was called.
 */
export function extractToolEvidence(
  messages: readonly unknown[] | undefined,
): Array<{ name: string; resultText: string }> {
  if (!messages) return [];
  const evidence: Array<{ name: string; resultText: string }> = [];
  for (const message of messages) {
    if (!message || typeof message !== 'object') continue;
    const content = (message as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (!part || typeof part !== 'object') continue;
      const candidate = part as {
        type?: unknown;
        toolName?: unknown;
        output?: unknown;
        result?: unknown;
      };
      if (candidate.type !== 'tool-result' || typeof candidate.toolName !== 'string') continue;
      const rawName = candidate.toolName.startsWith('kestrel-')
        ? candidate.toolName.slice('kestrel-'.length)
        : candidate.toolName;
      const output = candidate.output ?? candidate.result ?? null;
      evidence.push({
        name: rawName,
        resultText:
          output === null || output === undefined
            ? ''
            : typeof output === 'string'
              ? output
              : JSON.stringify(output),
      });
    }
  }
  return evidence;
}

export function mergeToolEvidenceWithParts(
  fromMessages: Array<{ name: string; resultText: string }>,
  parts: readonly MastraToolInvocationPart[],
): Array<{ name: string; resultText: string }> {
  const out = [...fromMessages];
  for (const part of parts) {
    if (part.state !== 'output-available' || part.output === undefined) continue;
    const resultText =
      part.output === null
        ? ''
        : typeof part.output === 'string'
          ? part.output
          : JSON.stringify(part.output);
    if (!out.some((e) => e.name === part.toolName && e.resultText === resultText)) {
      out.push({ name: part.toolName, resultText });
    }
  }
  return out;
}
