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

// Cross-symbol comparison synthesis.
//
// A-01 (B-01/B-08) — a comparison always runs one bounded LLM synthesis over
// the per-symbol packets and desk opinions ("compare these N packets …"),
// then verifies the answer against the union of the packets' evidence with the
// same single bounded repair as full-mode fusion.
//
// F-01 — at least one healthy packet is required; blocked symbols are
// disclosed in the prompt and compared against the healthy subset.

import { verifyComparisonFusionAnswer } from '../fusion-verifier';
import { comparisonFusionInstructionsForRequest } from '../prompts';
import { createCommitteeAgent, FUSION_AGENT_ID } from '../specialists';
import { contextWithPackets, MastraModeStrictFailureError } from '../types';
import { runFusionWithRepair } from './fusion-run';
import type { CommitteeComparisonSynthesisArgs, CommitteeSynthesisResult } from './types';

export async function synthesizeComparisonAnswer(
  args: CommitteeComparisonSynthesisArgs,
): Promise<CommitteeSynthesisResult> {
  const {
    prompt,
    packets,
    opinions,
    executionStats,
    blockedSymbols,
    blockedMissingData,
    requestContext,
    signal,
    deps,
  } = args;
  if (packets.length === 0) {
    throw new MastraModeStrictFailureError(
      ['fusion'],
      new Error('Comparison synthesis requires at least one collected packet.'),
    );
  }
  const fusionModel = deps.resolveModelForAgent?.('fusion') ?? {
    model: deps.model,
    modelId: deps.modelId,
    providerId: deps.providerId,
  };
  const fusionAgent = createCommitteeAgent(
    fusionModel.model,
    FUSION_AGENT_ID,
    (ctx: {
      requestContext: Parameters<
        typeof comparisonFusionInstructionsForRequest
      >[0]['requestContext'];
    }) => comparisonFusionInstructionsForRequest({ requestContext: ctx.requestContext }),
    deps.memory,
    deps.inputProcessors,
    deps.scorers,
  );

  const runFusion = async (fusionPrompt: string) =>
    fusionAgent.generate(fusionPrompt, {
      requestContext: contextWithPackets(
        requestContext,
        packets,
        opinions,
        blockedSymbols,
        blockedMissingData,
      ),
      ...(deps.fusionCallOptions ? { memory: deps.fusionCallOptions } : {}),
      toolChoice: 'none' as const,
      maxSteps: deps.maxSteps,
      ...(signal ? { abortSignal: signal } : {}),
    });

  return runFusionWithRepair({
    prompt,
    executionStats,
    fusionModel,
    runFusion,
    renderFusionResult: (result) => result.text,
    verify: (text) => verifyComparisonFusionAnswer(text, packets, opinions),
    ledger: deps.ledger,
    failureLabel: 'Comparison fusion verification failed after repair',
  });
}
