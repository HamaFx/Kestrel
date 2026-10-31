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

// Audit 2026-10-31 (R1): the onboarding page reads the RLS-protected
// `user_settings` table. Under the non-bypass application role an unscoped
// read returns zero rows, so a returning user would be sent through
// onboarding again. These tests pin the runtime contract: the settings read
// runs inside `withUserTenantRO`, and a completed row still redirects.

import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import OnboardingPage from '@/app/onboarding/page';

const mocks = vi.hoisted(() => ({
  events: [] as string[],
  auth: vi.fn(),
  redirect: vi.fn(),
  withUserTenantRO: vi.fn(),
  wizardProps: null as Record<string, unknown> | null,
}));

vi.mock('@/auth', () => ({ auth: mocks.auth }));
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }));
vi.mock('@kestrel/db', () => ({
  schema: {
    userSettings: {
      userId: 'user_settings.user_id',
      tenantId: 'user_settings.tenant_id',
      onboardingCompleted: 'user_settings.onboarding_completed',
      onboardingProgress: 'user_settings.onboarding_progress',
    },
    symbolCatalog: {
      symbol: 'symbol_catalog.symbol',
      isActive: 'symbol_catalog.is_active',
      tenantId: 'symbol_catalog.tenant_id',
      sortOrder: 'symbol_catalog.sort_order',
    },
  },
  withUserTenantRO: mocks.withUserTenantRO,
}));
vi.mock('@/components/brand/kestrel-brand', () => ({ KestrelBrand: () => null }));
vi.mock('@/components/onboarding/wizard', () => ({
  OnboardingWizard: (props: Record<string, unknown>) => {
    mocks.wizardProps = props;
    return null;
  },
}));

class RedirectSignal extends Error {
  constructor(readonly url: string) {
    super(`redirect:${url}`);
  }
}

/** Queue-backed thenable stand-in for a Drizzle query chain. */
function makeScopedDb(batches: unknown[][]): unknown {
  const query: Record<string, unknown> = {};
  const method = () => query;
  Object.assign(query, {
    select: method,
    from: method,
    where: method,
    orderBy: method,
    then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
      Promise.resolve(batches.shift() ?? []).then(resolve, reject),
  });
  return query;
}

async function render(): Promise<string | undefined> {
  try {
    const element = await OnboardingPage();
    // Renders (and therefore invokes) the mocked child components so their
    // props can be asserted; the tree itself is discarded.
    renderToStaticMarkup(element);
    return undefined;
  } catch (err) {
    if (err instanceof RedirectSignal) return err.url;
    throw err;
  }
}

describe('onboarding page scope (audit 2026-10-31 R1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.events.length = 0;
    mocks.wizardProps = null;

    mocks.auth.mockResolvedValue({ user: { id: 'user-1', name: 'Ada' } });
    mocks.redirect.mockImplementation((url: string) => {
      mocks.events.push(`redirect:${url}`);
      throw new RedirectSignal(url);
    });
    mocks.withUserTenantRO.mockImplementation(
      async (userId: string, work: (db: unknown) => Promise<unknown>) => {
        mocks.events.push(`tenant:enter:${userId}`);
        const result = await work(
          makeScopedDb([
            [{ userId: 'user-1', onboardingCompleted: false, onboardingProgress: { step: 2 } }],
            [{ symbol: 'XAUUSD', displayName: 'Gold' }],
          ]),
        );
        mocks.events.push(`tenant:exit:${userId}`);
        return result;
      },
    );
  });

  it('reads settings and the catalog inside the user tenant scope', async () => {
    const url = await render();

    expect(url).toBeUndefined();
    expect(mocks.withUserTenantRO).toHaveBeenCalledWith('user-1', expect.any(Function));
    expect(mocks.events).toEqual(['tenant:enter:user-1', 'tenant:exit:user-1']);
    expect(mocks.wizardProps).toMatchObject({
      initialName: 'Ada',
      initialProgress: { step: 2 },
      symbolsCatalog: [{ symbol: 'XAUUSD', displayName: 'Gold' }],
    });
  });

  it('redirects a user who already completed onboarding', async () => {
    mocks.withUserTenantRO.mockImplementation(
      async (userId: string, work: (db: unknown) => Promise<unknown>) => {
        mocks.events.push(`tenant:enter:${userId}`);
        const result = await work(
          makeScopedDb([[{ userId: 'user-1', onboardingCompleted: true }], [{ symbol: 'XAUUSD' }]]),
        );
        mocks.events.push(`tenant:exit:${userId}`);
        return result;
      },
    );

    const url = await render();

    expect(url).toBe('/dashboard');
    expect(mocks.withUserTenantRO).toHaveBeenCalledWith('user-1', expect.any(Function));
    expect(mocks.wizardProps).toBeNull();
  });

  it('redirects unauthenticated visitors to login without touching the database', async () => {
    mocks.auth.mockResolvedValue(null);

    const url = await render();

    expect(url).toBe('/login');
    expect(mocks.withUserTenantRO).not.toHaveBeenCalled();
  });
});
