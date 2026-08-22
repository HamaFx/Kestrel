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
import { describe, expect, it, vi } from 'vitest';

import { useTimeframe } from '../src/hooks/use-tf';

const mockSetTf = vi.fn();

vi.mock('nuqs', () => ({
  parseAsStringLiteral: () => ({
    withDefault: vi.fn(() => '1h'),
  }),
  useQueryState: vi.fn(() => ['1h', mockSetTf]),
}));

describe('useTimeframe', () => {
  it('returns the default timeframe from URL state', () => {
    const { result } = renderHook(() => useTimeframe());
    expect(result.current[0]).toBe('1h');
    expect(typeof result.current[1]).toBe('function');
  });

  it('calls setTf when the setter is invoked', () => {
    const { result } = renderHook(() => useTimeframe());
    act(() => result.current[1]('5m'));
    expect(mockSetTf).toHaveBeenCalledWith('5m');
  });
});
