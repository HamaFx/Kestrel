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

// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { apiFetch } from '@/lib/api-client';

import { useThreadTitle } from '../src/hooks/use-thread-title';

vi.mock('@/lib/api-client', () => ({ apiFetch: vi.fn(), apiMutate: vi.fn() }));

const apiFetchMock = vi.mocked(apiFetch);

describe('useThreadTitle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    apiFetchMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('returns the initial title', () => {
    const { result } = renderHook(() =>
      useThreadTitle({
        threadId: 'thread-1',
        initialTitle: 'My Chat',
        status: 'ready',
        messageCount: 0,
      }),
    );
    expect(result.current.title).toBe('My Chat');
  });

  it('fetches LLM title when status is ready and has 2+ messages', async () => {
    let resolveJson: (value: unknown) => void;
    const jsonPromise = new Promise((resolve) => {
      resolveJson = resolve;
    });

    apiFetchMock.mockReturnValue(jsonPromise as Promise<unknown>);

    const { result } = renderHook(() =>
      useThreadTitle({
        threadId: 'thread-2',
        initialTitle: 'New Chat',
        status: 'ready',
        messageCount: 5,
      }),
    );

    // Wait for the fetch to be called
    await vi.waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledWith('/api/chat/threads/thread-2', { skipCsrf: true });
    });

    // Resolve the JSON promise
    await act(async () => {
      resolveJson!({ thread: { title: 'Gold Analysis', titleSource: 'llm' } });
    });

    expect(result.current.title).toBe('Gold Analysis');
  });

  it('does not fetch when messageCount < 2', () => {
    renderHook(() =>
      useThreadTitle({
        threadId: 'thread-3',
        initialTitle: 'New Chat',
        status: 'ready',
        messageCount: 1,
      }),
    );

    expect(apiFetchMock).not.toHaveBeenCalled();
  });

  it('does not fetch when status is not ready', () => {
    renderHook(() =>
      useThreadTitle({
        threadId: 'thread-4',
        initialTitle: 'New Chat',
        status: 'submitted',
        messageCount: 5,
      }),
    );

    expect(apiFetchMock).not.toHaveBeenCalled();
  });

  it('keeps initial title when fetch fails', async () => {
    apiFetchMock.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() =>
      useThreadTitle({
        threadId: 'thread-5',
        initialTitle: 'Stable Title',
        status: 'ready',
        messageCount: 3,
      }),
    );

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(result.current.title).toBe('Stable Title');
  });

  it('deduplicates fetches by threadId', async () => {
    apiFetchMock.mockResolvedValue({
      thread: { title: 'Analysis', titleSource: 'llm' },
    });

    const { rerender } = renderHook((props) => useThreadTitle(props), {
      initialProps: {
        threadId: 'thread-6',
        initialTitle: 'Chat',
        status: 'ready',
        messageCount: 3,
      },
    });

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(apiFetchMock).toHaveBeenCalledTimes(1);

    // Rerender with same threadId should not fetch again
    rerender({
      threadId: 'thread-6',
      initialTitle: 'Chat',
      status: 'ready',
      messageCount: 10,
    });

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    // Still only one call
    expect(apiFetchMock).toHaveBeenCalledTimes(1);
  });
});
