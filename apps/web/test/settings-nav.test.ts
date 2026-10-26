// @vitest-environment node
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

// Phase 3 Task 2 — personal BYOK settings are first-class navigation, not an
// operator-only afterthought. These contracts keep the `AI & Intelligence`
// group reachable and keep exactly one entry highlighted per route.

import { describe, expect, it } from 'vitest';

import {
  BASE_NAV_GROUPS,
  isNavItemActive,
} from '@/app/(app)/settings/_components/settings-nav/nav-groups';

const AI_ROUTES = ['/settings/api-keys', '/settings/models', '/settings/agent'] as const;

describe('Settings navigation — BYOK access (Phase 3)', () => {
  it('exposes an AI & Intelligence group covering the personal BYOK routes', () => {
    const ai = BASE_NAV_GROUPS.find((group) => group.id === 'ai');

    expect(ai).toBeDefined();
    expect(ai?.shortLabel).toBe('AI');
    expect(ai?.items.map((item) => item.href)).toEqual([...AI_ROUTES]);
  });

  it('highlights exactly the active AI route for every AI route', () => {
    const ai = BASE_NAV_GROUPS.find((group) => group.id === 'ai');
    const items = ai?.items ?? [];

    for (const route of AI_ROUTES) {
      const active = items.filter((item) => isNavItemActive(item, route));
      expect(active.map((item) => item.href)).toEqual([route]);
    }
  });

  it('keeps General exact so AI sub-routes do not light it up', () => {
    const overview = BASE_NAV_GROUPS.find((group) => group.id === 'overview');
    const general = overview?.items.find((item) => item.href === '/settings');

    expect(general?.exact).toBe(true);
    expect(general ? isNavItemActive(general, '/settings') : null).toBe(true);
    expect(general ? isNavItemActive(general, '/settings/api-keys') : null).toBe(false);
  });
});
