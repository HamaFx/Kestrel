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
// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AdminMastraRuns } from '@/app/(app)/admin/_components/admin-mastra-runs';

const mockApiFetch = vi.hoisted(() => vi.fn());

vi.mock('@/lib/http/api-client', () => ({
  apiFetch: mockApiFetch,
}));

function mastraRun(overrides: Record<string, unknown> = {}) {
  return {
    runId: 'run-abc123def456',
    kind: 'mastra_mode',
    model: 'google/gemini-2.5-pro',
    provider: 'google',
    inputTokens: 100,
    outputTokens: 50,
    toolCalls: 3,
    ms: 1234,
    estCostUsd: 0.01,
    createdAt: new Date().toISOString(),
    traceId: null,
    langfuseUrl: null,
    workflow: {
      workflowId: 'symbol-research',
      status: 'success',
      failedSteps: [],
      completedSteps: 3,
      totalSteps: 3,
      error: null,
    },
    scores: [],
    scoreMean: null,
    error: null,
    ...overrides,
  };
}

describe('AdminMastraRuns', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders the failure detail (verifier findings) on failed runs only', async () => {
    const failureDetail =
      'fusion: Mastra analysis could not complete. Failed agents: fusion. (cause: Fusion verification failed after repair: number 2142.60 not grounded)';
    mockApiFetch.mockResolvedValue({
      hours: 72,
      count: 2,
      failed: 1,
      scored: 0,
      runs: [
        mastraRun({
          runId: 'run-failed-1',
          kind: 'mastra_mode_failed',
          workflow: {
            workflowId: 'symbol-research',
            status: 'failed',
            failedSteps: ['fusion'],
            completedSteps: 2,
            totalSteps: 3,
            error: failureDetail,
          },
          error: failureDetail,
        }),
        mastraRun({ runId: 'run-ok-1' }),
      ],
    });

    render(<AdminMastraRuns />);

    // The failure detail is rendered as a truncated secondary line under the
    // status badge so an admin sees WHY the committee run failed.
    const detail = await screen.findByText(failureDetail);
    expect(detail).toHaveAttribute('title', failureDetail);
    expect(screen.getByText('failed@fusion')).toBeInTheDocument();
    // One failed run in the summary line.
    expect(screen.getByText(/1 failed/)).toBeInTheDocument();
  });

  it('renders no failure line for runs without failure detail', async () => {
    mockApiFetch.mockResolvedValue({
      hours: 72,
      count: 1,
      failed: 0,
      scored: 0,
      runs: [mastraRun()],
    });

    render(<AdminMastraRuns />);

    expect(await screen.findByText('success')).toBeInTheDocument();
    expect(screen.queryByText(/^fusion: /)).not.toBeInTheDocument();
    expect(screen.getByText(/0 failed/)).toBeInTheDocument();
  });
});
