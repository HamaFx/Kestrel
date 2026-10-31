// @vitest-environment jsdom
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

// Phase 3 (P2-3) — `useCustomAgents` must treat the plugin API's 404 as a
// normal "no agents" state and must not re-fire the request on every chat
// navigation once it has learned the plugin is not installed.

import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useCustomAgents } from '@/hooks/use-custom-agents';

afterEach(cleanup);

describe('useCustomAgents', () => {
  it('gates on `enabled`, memoises the 404 and never re-fetches for the session', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 404 }));
    vi.stubGlobal('fetch', fetchMock);

    // 1. Known-not-installed callers never issue the request.
    const disabled = renderHook(() => useCustomAgents({ enabled: false }));
    await waitFor(() => expect(disabled.result.current.loading).toBe(false));
    expect(disabled.result.current.agents).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
    disabled.unmount();

    // 2. Unknown callers probe once; a 404 means "no agents", not an error.
    const first = renderHook(() => useCustomAgents());
    await waitFor(() => expect(first.result.current.loading).toBe(false));
    expect(first.result.current.agents).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    first.unmount();

    // 3. Navigating to another chat thread must not re-fire the 404.
    const second = renderHook(() => useCustomAgents());
    await waitFor(() => expect(second.result.current.loading).toBe(false));
    expect(second.result.current.agents).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
