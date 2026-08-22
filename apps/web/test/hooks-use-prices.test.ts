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

import { fetchPrices } from '@/lib/market-client';

import { usePrice, usePrices } from '../src/hooks/use-prices';

vi.mock('@/lib/market-client', () => ({
  fetchPrices: vi.fn(),
}));

const mockFetchPrices = vi.mocked(fetchPrices);

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
}

describe('usePrices', () => {
  beforeEach(() => {
    mockFetchPrices.mockReset();
  });

  it('returns empty data when no symbols are provided', () => {
    const { result } = renderHook(() => usePrices([]), { wrapper: createWrapper() });
    expect(result.current.data).toBeUndefined();
    expect(mockFetchPrices).not.toHaveBeenCalled();
  });

  it('fetches and returns prices for given symbols', async () => {
    const ticks = [
      { symbol: 'XAUUSD', bid: 1900.5, ask: 1901.0, mid: 1900.75, ts: 1, source: 'test' },
      { symbol: 'EURUSD', bid: 1.05, ask: 1.06, mid: 1.055, ts: 1, source: 'test' },
    ];
    mockFetchPrices.mockResolvedValue(ticks);

    const { result } = renderHook(() => usePrices(['XAUUSD', 'EURUSD']), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.data).toEqual(ticks));
    expect(mockFetchPrices).toHaveBeenCalledWith(
      ['EURUSD', 'XAUUSD'],
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });
});

describe('usePrice', () => {
  beforeEach(() => {
    mockFetchPrices.mockReset();
  });

  it('extracts the tick for the requested symbol', async () => {
    const ticks = [
      { symbol: 'XAUUSD', bid: 1900.5, ask: 1901.0, mid: 1900.75, ts: 1, source: 'test' },
      { symbol: 'EURUSD', bid: 1.05, ask: 1.06, mid: 1.055, ts: 1, source: 'test' },
    ];
    mockFetchPrices.mockResolvedValue(ticks);

    const { result } = renderHook(() => usePrice('XAUUSD'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.tick).toEqual(ticks[0]));
  });

  it('returns undefined tick when symbol is not in the response', async () => {
    mockFetchPrices.mockResolvedValue([
      { symbol: 'EURUSD', bid: 1.05, ask: 1.06, mid: 1.055, ts: 1, source: 'test' },
    ]);

    const { result } = renderHook(() => usePrice('GBPUSD'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.tick).toBeUndefined();
  });
});
