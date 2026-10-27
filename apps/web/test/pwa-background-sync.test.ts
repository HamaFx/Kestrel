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

// Periodic Background Sync is the only path that lets an installed but rarely
// opened app discover a deploy, and it is Chromium-only — so the interesting
// behaviour is everything that must *not* happen in the browsers that lack it.
import { describe, expect, it, vi } from 'vitest';

import {
  registerShellRefresh,
  SHELL_REFRESH_INTERVAL_MS,
  SHELL_REFRESH_TAG,
  supportsPeriodicSync,
} from '@/lib/pwa/background-sync';

interface FakeOptions {
  permission?: PermissionState | 'throws';
  registerThrows?: boolean;
}

function fakeRegistration(options: FakeOptions = {}) {
  const register = vi.fn(async () => {
    if (options.registerThrows) throw new Error('denied');
  });
  const registration = {
    periodicSync: { register, unregister: vi.fn() },
  } as unknown as ServiceWorkerRegistration;

  if (options.permission) {
    vi.stubGlobal('navigator', {
      permissions: {
        query: async () => {
          if (options.permission === 'throws') throw new TypeError('unknown permission');
          return { state: options.permission };
        },
      },
    });
  } else {
    vi.stubGlobal('navigator', {});
  }

  return { registration, register };
}

describe('supportsPeriodicSync', () => {
  it('is false without the API', () => {
    vi.stubGlobal('navigator', {});
    expect(supportsPeriodicSync({} as ServiceWorkerRegistration)).toBe(false);
  });

  it('is true when the registration exposes register()', () => {
    const { registration } = fakeRegistration();
    expect(supportsPeriodicSync(registration)).toBe(true);
  });
});

describe('registerShellRefresh', () => {
  it('registers the shell-refresh tag with the documented interval', async () => {
    const { registration, register } = fakeRegistration({ permission: 'granted' });

    await expect(registerShellRefresh(registration)).resolves.toBe(true);
    expect(register).toHaveBeenCalledWith(SHELL_REFRESH_TAG, {
      minInterval: SHELL_REFRESH_INTERVAL_MS,
    });
    expect(SHELL_REFRESH_TAG).toBe('kestrel-shell-refresh');
    // The worker's own floor; a shorter one would just wake up to no-op.
    expect(SHELL_REFRESH_INTERVAL_MS).toBe(6 * 60 * 60 * 1000);
  });

  it('stays out of the way when the platform has not granted the permission', async () => {
    // Denied = not installed, or too little engagement. Registering anyway would
    // surface as a console error on every load.
    const { registration, register } = fakeRegistration({ permission: 'denied' });

    await expect(registerShellRefresh(registration)).resolves.toBe(false);
    expect(register).not.toHaveBeenCalled();
  });

  it('still tries when the permission name is unknown to the browser', async () => {
    const { registration, register } = fakeRegistration({ permission: 'throws' });

    await expect(registerShellRefresh(registration)).resolves.toBe(true);
    expect(register).toHaveBeenCalled();
  });

  it('reports failure instead of throwing when the browser refuses', async () => {
    const { registration } = fakeRegistration({ permission: 'granted', registerThrows: true });

    await expect(registerShellRefresh(registration)).resolves.toBe(false);
  });

  it('is a no-op on browsers without the API (Safari, Firefox)', async () => {
    vi.stubGlobal('navigator', {});
    const registration = {} as ServiceWorkerRegistration;

    await expect(registerShellRefresh(registration)).resolves.toBe(false);
  });
});
