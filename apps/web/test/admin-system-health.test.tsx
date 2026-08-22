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

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AdminSystemHealth } from '@/app/(app)/admin/_components/admin-system-health';

let visibilityState: VisibilityState = 'visible';

Object.defineProperty(document, 'visibilityState', {
  get: () => visibilityState,
  configurable: true,
});

const mockApiFetch = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api-client', () => ({
  apiFetch: mockApiFetch,
}));

describe('AdminSystemHealth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: false });
    visibilityState = 'visible';
  });

  afterEach(() => {
    cleanup();
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('fetches health on mount and every 30 seconds while visible', async () => {
    mockApiFetch.mockResolvedValue({
      ts: new Date().toISOString(),
      dbOk: true,
      overall: 'healthy',
      langfuseActive: false,
      langfuseBaseUrl: null,
      slis: [],
      anomalies: [],
      dbLatencyMs: 1,
    });

    render(<AdminSystemHealth />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(mockApiFetch).toHaveBeenCalledTimes(1);
    expect(screen.getByText('All Systems Healthy')).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(mockApiFetch).toHaveBeenCalledTimes(2);
  });

  it('refetches with the selected time window', async () => {
    mockApiFetch.mockResolvedValue({
      ts: new Date().toISOString(),
      dbOk: true,
      overall: 'healthy',
      langfuseActive: false,
      langfuseBaseUrl: null,
      slis: [],
      anomalies: [],
      dbLatencyMs: 1,
    });

    render(<AdminSystemHealth />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    fireEvent.click(screen.getByRole('button', { name: '1h' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(mockApiFetch).toHaveBeenLastCalledWith(
      '/api/admin/health-slo?hours=1',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('skips fetching while hidden and resumes when visible', async () => {
    mockApiFetch.mockResolvedValue({
      ts: new Date().toISOString(),
      dbOk: true,
      overall: 'healthy',
      langfuseActive: false,
      langfuseBaseUrl: null,
      slis: [],
      anomalies: [],
      dbLatencyMs: 1,
    });

    render(<AdminSystemHealth />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(mockApiFetch).toHaveBeenCalledTimes(1);

    visibilityState = 'hidden';
    document.dispatchEvent(new Event('visibilitychange'));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(mockApiFetch).toHaveBeenCalledTimes(1);

    visibilityState = 'visible';
    document.dispatchEvent(new Event('visibilitychange'));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(mockApiFetch).toHaveBeenCalledTimes(2);
  });

  it('aborts in-flight requests on unmount', async () => {
    let signal: AbortSignal | undefined;
    mockApiFetch.mockImplementation((_input, options) => {
      signal = options.signal;
      return new Promise(() => {
        // never resolves
      });
    });

    const { unmount } = render(<AdminSystemHealth />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(signal).toBeDefined();
    unmount();

    expect(signal?.aborted).toBe(true);
  });
});
