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
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchCandles } from '@/lib/market-client';

import { useCandles } from '../src/hooks/use-candles';

vi.mock('@/lib/market-client', () => ({
  fetchCandles: vi.fn(),
}));

const mockFetchCandles = vi.mocked(fetchCandles);

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
}

describe('useCandles', () => {
  beforeEach(() => {
    mockFetchCandles.mockReset();
  });

  it('fetches and returns candles for a symbol and timeframe', async () => {
    const candles = [
      {
        symbol: 'XAUUSD',
        tf: '1h',
        t: 1,
        o: 100,
        h: 110,
        l: 99,
        c: 105,
        v: 1000,
        source: 'test',
        fetchedAt: 1,
      },
    ];
    mockFetchCandles.mockResolvedValue(candles);

    const { result } = renderHook(() => useCandles('XAUUSD', '1h'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.data).toEqual(candles));
    expect(mockFetchCandles).toHaveBeenCalledWith(
      'XAUUSD',
      '1h',
      300,
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('passes custom count to fetchCandles', async () => {
    mockFetchCandles.mockResolvedValue([]);

    renderHook(() => useCandles('EURUSD', '5m', 100), {
      wrapper: createWrapper(),
    });

    await waitFor(() =>
      expect(mockFetchCandles).toHaveBeenCalledWith('EURUSD', '5m', 100, expect.any(Object)),
    );
  });

  it('does not fetch when enabled is false', () => {
    const { result } = renderHook(() => useCandles('XAUUSD', '1h', 300, { enabled: false }), {
      wrapper: createWrapper(),
    });

    expect(mockFetchCandles).not.toHaveBeenCalled();
    expect(result.current.isFetching).toBe(false);
  });

  it('handles errors from fetchCandles gracefully', () => {
    mockFetchCandles.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useCandles('XAUUSD', '1h'), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toBeUndefined();
  });
});
