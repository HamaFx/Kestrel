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

import type { XauusdResearchReport } from '@kestrel/ai/mastra';

export interface MastraChatMeta {
  agent: 'mastra-xauusd' | 'mastra';
  runId: string;
  modelId: string;
  providerId: string;
  researchStatus: 'succeeded' | 'blocked' | 'ready';
  dataQuality: 'complete' | 'partial' | 'degraded';
  packetId: string;
  observedCost: number;
  report: XauusdResearchReport | null;
  executionOutcome: 'completed' | 'failed' | 'cancelled';
  answerOutcome: 'ready' | 'blocked' | 'degraded' | 'partial';
  memoryMode: string;
  modelSnapshot: unknown;
  terminalReason: string;
}

export function createMastraChatMeta(
  input: Omit<MastraChatMeta, 'agent'> & { agent?: MastraChatMeta['agent'] },
): MastraChatMeta {
  return { agent: input.agent ?? 'mastra-xauusd', ...input };
}
