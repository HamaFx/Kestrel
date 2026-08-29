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

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GET } from '@/app/api/admin/onboarding/inspect/route';

vi.mock('@/lib/admin-auth', () => ({
  withAdminAuth:
    (handler: (req: Request, ctx: { user: { userId: string } }) => Promise<Response>) =>
    async (req: Request) =>
      handler(req, { user: { userId: 'admin-123' } }),
}));

const mockGetUserWithSettings = vi.hoisted(() => vi.fn());
const mockListUserSymbols = vi.hoisted(() => vi.fn());
const mockDecryptByok = vi.hoisted(() => vi.fn());

vi.mock('@kestrel/db', () => ({
  getUserWithSettings: mockGetUserWithSettings,
  listUserSymbols: mockListUserSymbols,
  updatePaymentStatus: vi.fn(),
  updateSubscriptionFromPayment: vi.fn(),
  schema: { users: {}, userSettings: {} },
}));

vi.mock('@kestrel/shared/encryption', () => ({
  decryptByok: mockDecryptByok,
}));

describe('GET /api/admin/onboarding/inspect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('inspects the admin user by default', async () => {
    mockGetUserWithSettings.mockResolvedValue({
      settings: {
        onboardingCompleted: true,
        onboardingProgress: { step: 1 },
        defaultSymbol: 'EURUSD',
        timezone: 'Europe/London',
        language: 'en',
        aiApiKeys: 'encrypted',
      },
    });
    mockListUserSymbols.mockResolvedValue([{ symbol: 'XAUUSD' }, { symbol: 'EURUSD' }]);
    mockDecryptByok.mockReturnValue({ openai: 'sk-...', anthropic: 'sk-...' });

    const req = new Request('http://localhost/api/admin/onboarding/inspect');
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.userId).toBe('admin-123');
    expect(body.onboardingCompleted).toBe(true);
    expect(body.userSettings.defaultSymbol).toBe('EURUSD');
    expect(body.watchlist).toEqual(['XAUUSD', 'EURUSD']);
    expect(body.hasApiKeys).toBe(true);
    expect(body.apiProviders).toEqual(['openai', 'anthropic']);
  });

  it('inspects a target user when userId is provided', async () => {
    mockGetUserWithSettings.mockResolvedValue({
      settings: {
        onboardingCompleted: false,
        onboardingProgress: null,
        defaultSymbol: 'XAUUSD',
        timezone: 'UTC',
        language: 'ar',
        aiApiKeys: null,
      },
    });
    mockListUserSymbols.mockResolvedValue([]);

    const req = new Request('http://localhost/api/admin/onboarding/inspect?userId=target-456');
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.userId).toBe('target-456');
    expect(body.hasApiKeys).toBe(false);
    expect(body.apiProviders).toEqual([]);
    expect(body.userSettings.language).toBe('ar');
  });

  it('falls back to defaults when settings are missing', async () => {
    mockGetUserWithSettings.mockResolvedValue({ settings: null });
    mockListUserSymbols.mockResolvedValue([]);

    const req = new Request('http://localhost/api/admin/onboarding/inspect?userId=target-789');
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.userId).toBe('target-789');
    expect(body.onboardingCompleted).toBe(false);
    expect(body.userSettings).toEqual({
      defaultSymbol: 'XAUUSD',
      timezone: 'UTC',
      language: 'en',
    });
  });
});
