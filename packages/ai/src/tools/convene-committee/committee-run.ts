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

// LLM committee execution for the convene_committee tool: runs the full
// Mastra mode with its own generation ledger and folds the spend into the
// caller's turn ledger.

import type { UserSettingsRow } from '@kestrel/db/schema';
import type { CommitteeVerdict, ConveneCommitteeOutput } from '@kestrel/shared';

import type { MastraModeOpinion } from '../../committee/types';
import { sanitizeExternalText } from '../../mastra-v2/packets/external-content';
import { runMastraMode } from '../../mastra-v2/planning/mode-runner';
import { createGenerationLedger } from '../../persistence/generation-ledger';
import type { maybeGetToolContext } from '../../runtime/tool-context';
import { opinionToVerdict } from './verdicts';

type ToolContext = NonNullable<ReturnType<typeof maybeGetToolContext>>;

export async function runLlmCommittee(args: {
  ctx: ToolContext;
  symbol: ConveneCommitteeOutput['symbol'];
  side: ConveneCommitteeOutput['side'];
  entry: number;
  stop?: number;
  target?: number;
  notes?: string;
  signal: AbortSignal | undefined;
  fallbackVerdicts: CommitteeVerdict[];
}): Promise<{ verdicts: CommitteeVerdict[]; consensusText: string; llmVerdictsUsed: boolean }> {
  const { ctx, symbol, side, entry, stop, target, notes, signal, fallbackVerdicts } = args;

  let verdicts: CommitteeVerdict[] = fallbackVerdicts;
  let consensusText = '';
  /**
   * P2-05 (audit 2026-10-18) — whether the LLM committee actually ran and
   * produced opinions. When it did not (no tool context, no BYOK key, or
   * a failed run), the card is the deterministic packet-grounded
   * heuristic and must say so in the consensus text.
   */
  let llmVerdictsUsed = false;

  const runId = crypto.randomUUID();
  // The nested committee run gets its own ledger: committee entry ids
  // (`specialist:*`, `critique:*`, `fusion`) are not namespaced, so a
  // shared ledger would silently drop the spend of a second committee call
  // in the same turn. The run's total is folded into the caller's turn
  // ledger below, where the budget reservation settles it.
  const committeeLedger = createGenerationLedger();
  try {
    const sanitizedNotes = notes ? sanitizeExternalText(notes, 300) : '';
    const prompt = [
      `Evaluate this proposed ${side.toUpperCase()} setup on ${symbol}:`,
      `- Entry: ${entry}`,
      stop !== undefined ? `- Stop: ${stop}` : '- Stop: not specified',
      target !== undefined ? `- Target: ${target}` : '- Target: not specified',
      sanitizedNotes ? `- Trader notes: ${sanitizedNotes}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    const modeResult = await runMastraMode({
      prompt,
      symbol,
      userId: ctx.userId,
      threadId: ctx.threadId,
      runId,
      mode: 'full',
      ...(signal ? { signal } : {}),
      ledger: committeeLedger,
      settings: {
        chatModel:
          ctx.userSettings?.chatModel ??
          (process.env.AI_DEFAULT_MODEL as UserSettingsRow['chatModel']) ??
          'google:gemini-2.5-flash',
        aiApiKeys: (ctx.userSettings?.aiApiKeys as string | null) ?? null,
        embeddingModel: ctx.userSettings?.embeddingModel ?? null,
        agentModelOverrides: ctx.userSettings?.agentModelOverrides ?? null,
      },
      env: {
        AI_GATEWAY_API_KEY: process.env.AI_GATEWAY_API_KEY,
        GOOGLE_GENERATIVE_AI_API_KEY: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
      },
    });

    if (modeResult.agentOpinions && modeResult.agentOpinions.length > 0) {
      const opinions = modeResult.agentOpinions;
      const fundOp = opinions.find((o: MastraModeOpinion) => o.agentName === 'fundamental');
      const techOp = opinions.find((o: MastraModeOpinion) => o.agentName === 'technical');
      const riskOp = opinions.find((o: MastraModeOpinion) => o.agentName === 'risk');
      const sentOp = opinions.find((o: MastraModeOpinion) => o.agentName === 'sentiment');
      verdicts = [
        opinionToVerdict('economist', fundOp, fallbackVerdicts[0]!),
        opinionToVerdict('technician', techOp, fallbackVerdicts[1]!),
        opinionToVerdict('risk_manager', riskOp, fallbackVerdicts[2]!),
        opinionToVerdict('sentiment', sentOp, fallbackVerdicts[3]!),
      ];
      consensusText = modeResult.finalText ?? '';
      llmVerdictsUsed = true;
    }
  } catch (err) {
    if (signal?.aborted) throw err;
    // Gracefully use deterministic packet-grounded verdicts when no LLM key is configured or on timeout.
  } finally {
    // Bill the nested committee run into the caller's turn ledger, including
    // partial spend on aborted or failed runs, so the settlement at the end
    // of the parent turn covers it.
    const committeeCost = committeeLedger.total();
    if (committeeCost > 0) {
      ctx.ledger?.recordCost(`committee:${runId}`, 'specialist', committeeCost);
    }
  }

  return { verdicts, consensusText, llmVerdictsUsed };
}
