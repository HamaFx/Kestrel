// SPDX-License-Identifier: Apache-2.0

// Promote/demote action for a user row: confirm, PATCH the role, refresh the
// list, and track the row that is currently pending.
import { useCallback, useState } from 'react';
import { toast } from 'sonner';

import { useConfirm } from '@/components/ui/confirm-drawer';
import { apiMutate } from '@/lib/http/api-client';
import type { UserSummary } from '@/lib/services/admin-dtos';

export function useUserRoleActions(refresh: () => Promise<void>) {
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);
  const [confirmEl, confirm] = useConfirm();

  const handleRoleChange = useCallback(
    async (user: UserSummary, newRole: 'admin' | 'user') => {
      const isPromote = newRole === 'admin';
      const confirmed = await confirm({
        title: isPromote ? 'Promote to admin?' : 'Demote to user?',
        description: `This will change ${user.email}'s role to ${newRole}.`,
        confirmLabel: isPromote ? 'Promote' : 'Demote',
        tone: isPromote ? 'default' : 'danger',
      });
      if (!confirmed) return;

      setPendingUserId(user.id);
      try {
        await apiMutate(`/api/admin/users/${user.id}/role`, {
          method: 'PATCH',
          body: JSON.stringify({ role: newRole }),
        });
        toast.success(`${isPromote ? 'Promoted' : 'Demoted'} ${user.email}`);
        await refresh();
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to update role';
        toast.error(msg);
      } finally {
        setPendingUserId((current) => (current === user.id ? null : current));
      }
    },
    [confirm, refresh],
  );

  return { pendingUserId, handleRoleChange, confirmEl };
}
