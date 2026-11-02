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

// Phase 4 Task 2 — native Mastra registrations for the sensitive user-scoped
// read tools. These names are granted only to capabilities whose manifest
// carries an explicit `sensitive-read` grant; they are never part of the
// canonical-chat public allowlist.
//
// Built lazily (see `read-only/index.ts`): reading the legacy tool bindings at
// module scope would race the `instance ↔ tools` import cycle.

import {
  ComputePositionHealthInputSchema,
  GetJournalStatsInputSchema,
  ReplaySetupInputSchema,
  type ComputePositionHealthOutput,
  type GetJournalStatsOutput,
  type ReplaySetupOutput,
} from '@kestrel/shared';
import { createTool } from '@mastra/core/tools';
import type { z } from 'zod';

import {
  createReadOnlyToolExecute,
  executeLegacyReadOnlyTool,
  readOnlyToolDescription,
} from '@ai/mastra-v2/tools/tool-lifecycle';
import { computePositionHealthTool } from '@ai/tools/compute-position-health';
import { getJournalStatsTool } from '@ai/tools/get-journal-stats';
import { replaySetupTool } from '@ai/tools/replay-setup';

/** Native sensitive user-read tools by registry name. */
export function buildUserDataReadOnlyTools(): Readonly<Record<string, unknown>> {
  return {
    get_journal_stats: createTool({
      id: 'kestrel-get_journal_stats',
      description: readOnlyToolDescription(getJournalStatsTool, 'get_journal_stats'),
      inputSchema: GetJournalStatsInputSchema,
      execute: createReadOnlyToolExecute<
        z.infer<typeof GetJournalStatsInputSchema>,
        GetJournalStatsOutput
      >('kestrel-get_journal_stats', 'get_journal_stats', (input, context) =>
        executeLegacyReadOnlyTool(getJournalStatsTool, input, context),
      ),
    }),
    compute_position_health: createTool({
      id: 'kestrel-compute_position_health',
      description: readOnlyToolDescription(computePositionHealthTool, 'compute_position_health'),
      inputSchema: ComputePositionHealthInputSchema,
      execute: createReadOnlyToolExecute<
        z.infer<typeof ComputePositionHealthInputSchema>,
        ComputePositionHealthOutput
      >('kestrel-compute_position_health', 'compute_position_health', (input, context) =>
        executeLegacyReadOnlyTool(computePositionHealthTool, input, context),
      ),
    }),
    replay_setup: createTool({
      id: 'kestrel-replay_setup',
      description: readOnlyToolDescription(replaySetupTool, 'replay_setup'),
      inputSchema: ReplaySetupInputSchema,
      execute: createReadOnlyToolExecute<z.infer<typeof ReplaySetupInputSchema>, ReplaySetupOutput>(
        'kestrel-replay_setup',
        'replay_setup',
        (input, context) => executeLegacyReadOnlyTool(replaySetupTool, input, context),
      ),
    }),
  };
}
