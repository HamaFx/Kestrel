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

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { _resetHealth, getScore } from '../src/health';
import { runWithFailover } from '../src/failover';
import { ProviderError } from '../src/errors';

describe('failover caller AbortSignal handling (F-05)', () => {
  beforeEach(() => {
    _resetHealth();
  });

  it('throws immediately when signal is already aborted without dinging health score', async () => {
    const ctrl = new AbortController();
    ctrl.abort(new Error('Turn cancelled'));

    const provider1 = vi.fn().mockResolvedValue('p1');
    const provider2 = vi.fn().mockResolvedValue('p2');

    await expect(
      runWithFailover(
        [
          { name: 'p1', run: provider1 },
          { name: 'p2', run: provider2 },
        ],
        { signal: ctrl.signal },
      ),
    ).rejects.toThrow('Turn cancelled');

    expect(provider1).not.toHaveBeenCalled();
    expect(provider2).not.toHaveBeenCalled();
    expect(getScore('p1')).toBe(0.5);
    expect(getScore('p2')).toBe(0.5);
  });

  it('stops failover cascade when signal aborts during execution without dinging health score', async () => {
    const ctrl = new AbortController();

    const provider1 = vi.fn().mockImplementation(async () => {
      ctrl.abort(new Error('User aborted'));
      const err = new Error('The operation was aborted');
      err.name = 'AbortError';
      throw err;
    });

    const provider2 = vi.fn().mockResolvedValue('p2');

    await expect(
      runWithFailover(
        [
          { name: 'p1', run: provider1 },
          { name: 'p2', run: provider2 },
        ],
        { signal: ctrl.signal },
      ),
    ).rejects.toThrow('User aborted');

    expect(provider1).toHaveBeenCalledTimes(1);
    expect(provider2).not.toHaveBeenCalled();
    // p1 health should not be degraded due to caller cancellation
    expect(getScore('p1')).toBe(0.5);
    expect(getScore('p2')).toBe(0.5);
  });
});
