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

// Bounded silent self-correction when numeric claims are ungrounded.

import type { Agent, AgentMemoryOption } from '@mastra/core/agent';
import type { RequestContext } from '@mastra/core/request-context';
import type { ModelMessage } from 'ai';

import { withToolContext, type ToolContext } from '@ai/runtime/tool-context';

import { getMastraGenerationStats, type MastraGenerationStats } from '../../shared/telemetry';
import {
  extractToolPartsFromMessages,
  type MastraToolInvocationPart,
} from '../xauusd/legacy-tool-adapter';
import { checkCanonicalEvidence, type CanonicalToolEvidence } from './evidence';
import { extractToolEvidence, extractToolNames } from './tool-evidence';

export async function attemptCanonicalSelfCorrection(params: {
  agent: Agent;
  context: ToolContext;
  requestContext: RequestContext<Record<string, unknown>>;
  messages: ModelMessage[];
  draftText: string;
  initialFindings: readonly string[];
  initialToolEvidence: readonly CanonicalToolEvidence[];
  initialToolNames: readonly string[];
  toolPartsBuffer: MastraToolInvocationPart[];
  callMemory?: AgentMemoryOption | null;
  signal?: AbortSignal;
}): Promise<{
  repaired: boolean;
  text: string;
  evidence: ReturnType<typeof checkCanonicalEvidence>;
  toolNames: string[];
  toolParts: MastraToolInvocationPart[];
  extraStats: MastraGenerationStats;
} | null> {
  const {
    agent,
    context,
    requestContext,
    messages,
    draftText,
    initialFindings,
    initialToolEvidence,
    initialToolNames,
    toolPartsBuffer,
    callMemory,
    signal,
  } = params;

  const generateFn = (agent as unknown as { generate?: typeof agent.generate }).generate;
  if (typeof generateFn !== 'function') return null;

  const verifiedSummary =
    initialToolEvidence.length > 0
      ? initialToolEvidence.map((t) => `${t.name}: ${t.resultText.slice(0, 600)}`).join('\n')
      : 'None (no market-data tool was called).';

  const repairInstruction = [
    'SELF-CORRECTION REQUIRED: Your previous draft contained numeric market claims that were not verified by live tool outputs:',
    ...initialFindings.map((f) => `- ${f}`),
    `Verified tool outputs available so far:\n${verifiedSummary}`,
    'Either call the appropriate market-data tool now to fetch the live values, or rewrite your answer using ONLY verified numbers from tool outputs (or qualitative explanation without unverified prices).',
  ].join('\n\n');

  try {
    const repairMessages: ModelMessage[] = [
      ...messages,
      { role: 'assistant', content: draftText },
      { role: 'user', content: repairInstruction },
    ];
    const repairResult = await withToolContext(context, () =>
      agent.generate(repairMessages, {
        requestContext,
        toolChoice: 'auto',
        maxSteps: 2,
        ...(callMemory ? { memory: callMemory } : {}),
        ...(signal ? { abortSignal: signal } : {}),
      }),
    );
    if (!repairResult || typeof repairResult.text !== 'string') return null;
    const extraStats = getMastraGenerationStats(repairResult);
    const repairToolNames = extractToolNames(repairResult.response?.messages);
    const repairToolEvidence = extractToolEvidence(repairResult.response?.messages);
    const mergedToolEvidence = [...initialToolEvidence, ...repairToolEvidence];
    const mergedToolNames = [...new Set([...initialToolNames, ...repairToolNames])];
    const mergedToolParts = extractToolPartsFromMessages(
      repairResult.response?.messages,
      toolPartsBuffer,
    );
    const repairedEvidence = checkCanonicalEvidence(repairResult.text, mergedToolEvidence);
    return {
      repaired: repairedEvidence.ok,
      text: repairResult.text.trim(),
      evidence: repairedEvidence,
      toolNames: mergedToolNames,
      toolParts: mergedToolParts,
      extraStats,
    };
  } catch {
    return null;
  }
}
