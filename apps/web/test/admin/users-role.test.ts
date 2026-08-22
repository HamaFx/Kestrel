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

import { PATCH } from '@/app/api/admin/users/[id]/role/route';

vi.mock('@/lib/admin-auth', () => ({
  withAdminAuth:
    (
      handler: (
        req: Request,
        ctx: { user: { userId: string }; params: Promise<{ id: string }> },
      ) => Promise<Response>,
    ) =>
    async (req: Request, ctx: { params?: Promise<{ id: string }> }) =>
      handler(req, {
        user: { userId: 'admin-123' },
        params: ctx?.params ?? Promise.resolve({ id: 'target-123' }),
      }),
}));

const mockUpdateUserRoleService = vi.hoisted(() => vi.fn());

vi.mock('@/lib/services/admin', () => ({
  LastAdminError: class LastAdminError extends Error {},
  SelfDemoteError: class SelfDemoteError extends Error {},
  updateUserRoleService: mockUpdateUserRoleService,
}));

describe('PATCH /api/admin/users/[id]/role', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('promotes a user to admin', async () => {
    mockUpdateUserRoleService.mockResolvedValue({ ok: true, previousRole: 'user' });

    const req = new Request('http://localhost/api/admin/users/target-123/role', {
      method: 'PATCH',
      body: JSON.stringify({ role: 'admin' }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: 'target-123' }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.previousRole).toBe('user');
    expect(mockUpdateUserRoleService).toHaveBeenCalledWith({
      actorUserId: 'admin-123',
      targetUserId: 'target-123',
      role: 'admin',
    });
  });

  it('rejects a self-demote attempt', async () => {
    const { SelfDemoteError } = await import('@/lib/services/admin');
    mockUpdateUserRoleService.mockRejectedValue(new SelfDemoteError('Cannot demote yourself'));

    const req = new Request('http://localhost/api/admin/users/admin-123/role', {
      method: 'PATCH',
      body: JSON.stringify({ role: 'user' }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: 'admin-123' }) });
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.error.code).toBe('SELF_DEMOTE');
  });

  it('rejects demoting the last admin', async () => {
    const { LastAdminError } = await import('@/lib/services/admin');
    mockUpdateUserRoleService.mockRejectedValue(new LastAdminError('Cannot demote the last admin'));

    const req = new Request('http://localhost/api/admin/users/target-123/role', {
      method: 'PATCH',
      body: JSON.stringify({ role: 'user' }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: 'target-123' }) });
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.error.code).toBe('LAST_ADMIN');
  });

  it('returns 404 when the target user does not exist', async () => {
    mockUpdateUserRoleService.mockRejectedValue(new Error('User not found'));

    const req = new Request('http://localhost/api/admin/users/missing-123/role', {
      method: 'PATCH',
      body: JSON.stringify({ role: 'admin' }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: 'missing-123' }) });
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error.code).toBe('NOT_FOUND');
  });
});
