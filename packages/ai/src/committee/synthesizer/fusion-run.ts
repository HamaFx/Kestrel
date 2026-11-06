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

// Shared fusion execution: one generation, one bounded repair, one strict
// verification gate, and one cost-ledger write. Single-symbol and comparison
// synthesis differ only in their prompt/context wiring and verifier.

import { estimateCostUsd } from '../../budget/pricing-catalog';
import {
  getMastraGenerationStats,
  type MastraGenerationStats,
} from '../../mastra-v2/shared/telemetry';
import type { GenerationLedger } from '../../persistence/generation-ledger';
import { fusionRepairPrompt, type FusionVerification } from '../fusion-verifier';
import { MastraModeStrictFailureError } from '../types';
import { aggregateStats } from './stats';
import type { CommitteeSynthesisResult } from './types';

interface UsageLike {
  inputTokens?: number | undefined;
  outputTokens?: number | undefined;
  promptTokens?: number | undefined;
  completionTokens?: number | undefined;
}

export interface FusionGenerationResult {
  text: string;
  object?: unknown;
  totalUsage?: UsageLike;
  usage?: UsageLike;
  toolCalls?: readonly unknown[];
  steps?: readonly unknown[];
}

export async function runFusionWithRepair(args: {
  prompt: string;
  executionStats: MastraGenerationStats[];
  fusionModel: { modelId: string; providerId: string };
  runFusion: (prompt: string) => Promise<FusionGenerationResult>;
  renderFusionResult: (result: FusionGenerationResult) => string;
  verify: (text: string) => FusionVerification;
  ledger: GenerationLedger;
  /** Prefix for the terminal verification error. */
  failureLabel: string;
}): Promise<CommitteeSynthesisResult> {
  const {
    prompt,
    executionStats,
    fusionModel,
    runFusion,
    renderFusionResult,
    verify,
    ledger,
    failureLabel,
  } = args;

  const fusionResult = await runFusion(prompt);
  let finalText = renderFusionResult(fusionResult);
  let generationStats: MastraGenerationStats[] = [getMastraGenerationStats(fusionResult)];
  let fusionCostUsd = estimateCostUsd(
    fusionModel.modelId,
    generationStats[0]!.inputTokens,
    generationStats[0]!.outputTokens,
  );

  const firstVerification = verify(finalText);
  if (!firstVerification.ok) {
    const repairResult = await runFusion(fusionRepairPrompt(prompt, firstVerification.findings));
    const repairStats = getMastraGenerationStats(repairResult);
    generationStats = [...generationStats, repairStats];
    fusionCostUsd += estimateCostUsd(
      fusionModel.modelId,
      repairStats.inputTokens,
      repairStats.outputTokens,
    );
    finalText = renderFusionResult(repairResult);
    const repairVerification = verify(finalText);
    if (!repairVerification.ok) {
      throw new MastraModeStrictFailureError(
        ['fusion'],
        new Error(
          `${failureLabel}: ${[...firstVerification.findings, ...repairVerification.findings].join('; ')}`,
        ),
      );
    }
  }

  ledger.recordCost('fusion', 'fusion', fusionCostUsd);
  return {
    finalText,
    stats: aggregateStats([...executionStats, ...generationStats]),
    fusionModelId: fusionModel.modelId,
    fusionProviderId: fusionModel.providerId,
  };
}
