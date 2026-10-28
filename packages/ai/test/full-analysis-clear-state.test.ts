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

// A requeued Full-analysis attempt must never resume the failed attempt's
// durable snapshot: the committee reuses persisted specialist step results,
// so a retry would re-throw the previous strict failure instead of running.

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { clearFullAnalysisWorkflowState } from '../src/mastra-v2/workflows/full-analysis-lifecycle';
import type * as FullAnalysisProjectionModule from '../src/mastra-v2/workflows/full-analysis-projection';
import { FULL_ANALYSIS_WORKFLOW_ID } from '../src/mastra-v2/workflows/full-analysis-types';

const storeState = vi.hoisted(() => ({
  store: null as null | { deleteWorkflowRunById: ReturnType<typeof vi.fn> },
}));

vi.mock('../src/mastra-v2/workflows/full-analysis-projection', async (importOriginal) => {
  const actual = await importOriginal<typeof FullAnalysisProjectionModule>();
  return { ...actual, workflowsStore: async () => storeState.store };
});

beforeEach(() => {
  storeState.store = null;
  vi.clearAllMocks();
});

describe('clearFullAnalysisWorkflowState', () => {
  it('deletes the durable workflow run for the queue run id', async () => {
    const deleteWorkflowRunById = vi.fn(async () => undefined);
    storeState.store = { deleteWorkflowRunById };

    await clearFullAnalysisWorkflowState('run-1');

    expect(deleteWorkflowRunById).toHaveBeenCalledTimes(1);
    expect(deleteWorkflowRunById).toHaveBeenCalledWith({
      runId: 'run-1',
      workflowName: FULL_ANALYSIS_WORKFLOW_ID,
    });
  });

  it('is a no-op when workflows storage is unavailable', async () => {
    await expect(clearFullAnalysisWorkflowState('run-2')).resolves.toBeUndefined();
  });

  it('swallows delete failures so the retry still runs', async () => {
    storeState.store = {
      deleteWorkflowRunById: vi.fn(async () => {
        throw new Error('snapshot already gone');
      }),
    };

    await expect(clearFullAnalysisWorkflowState('run-3')).resolves.toBeUndefined();
  });
});
