// SPDX-License-Identifier: Apache-2.0

// Registered-user list state: paged fetch lifecycle for /api/admin/users.
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

import { apiFetch } from '@/lib/http/api-client';
import type { UserSummary } from '@/lib/services/admin-dtos';

export function useAdminUsers(page: number, pageSize: number, debouncedQ: string) {
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const params = new URLSearchParams();
      params.set('limit', String(pageSize));
      params.set('offset', String(page * pageSize));
      if (debouncedQ) params.set('q', debouncedQ);

      const data = await apiFetch<{ users: UserSummary[]; total: number }>(
        `/api/admin/users?${params.toString()}`,
      );
      setUsers(data.users);
      setTotal(data.total);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load users';
      setFetchError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, debouncedQ]);

  useEffect(() => {
    void fetchUsers();
  }, [fetchUsers]);

  return { users, total, loading, fetchError, fetchUsers };
}
