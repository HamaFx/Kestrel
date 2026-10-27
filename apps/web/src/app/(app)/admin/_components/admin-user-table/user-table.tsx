'use client';

// SPDX-License-Identifier: Apache-2.0

// Sortable registered-user table with role badges and promote/demote actions.
import { IconUsers } from '@tabler/icons-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { formatAbsoluteTime } from '@/lib/formatters/format-number';
import type { UserSummary } from '@/lib/services/admin-dtos';

import { ROLE_TONE, type SortState } from './user-table-format';

interface UserTableProps {
  users: UserSummary[];
  sort: SortState;
  onSort: (key: SortState['key']) => void;
  pendingUserId: string | null;
  onRoleChange: (user: UserSummary, newRole: 'admin' | 'user') => void;
}

export function UserTable({ users, sort, onSort, pendingUserId, onRoleChange }: UserTableProps) {
  const headerCell = (key: SortState['key'], label: string) => (
    <button
      type="button"
      onClick={() => onSort(key)}
      className="hover:text-fg flex items-center gap-1 text-left font-medium"
    >
      {label}
      {sort.key === key && (
        <span className="text-fg-subtle">{sort.order === 'asc' ? '↑' : '↓'}</span>
      )}
    </button>
  );

  return (
    <div className="border-border overflow-x-auto rounded-sm border">
      <table className="table-stack w-full min-w-[600px] text-sm">
        <thead className="bg-bg-elev-2 text-fg-subtle">
          <tr>
            <th className="px-4 py-2">{headerCell('email', 'Email')}</th>
            <th className="px-4 py-2">{headerCell('role', 'Role')}</th>
            <th className="px-4 py-2">Onboarding</th>
            <th className="px-4 py-2">{headerCell('createdAt', 'Created')}</th>
            <th className="px-4 py-2 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {users.length === 0 ? (
            <tr>
              <td colSpan={5} className="px-4 py-6">
                <EmptyState
                  icon={<IconUsers className="size-6" />}
                  title="No users found"
                  description="Registered users will appear here."
                  bare
                />
              </td>
            </tr>
          ) : (
            users.map((user) => (
              <tr key={user.id} className="row-primary border-border border-t">
                <td className="text-fg px-4 py-2">
                  <div className="flex flex-col">
                    <span>{user.email}</span>
                    {user.name && <span className="text-fg-subtle text-xs">{user.name}</span>}
                  </div>
                </td>
                <td data-label="Role" className="px-4 py-2">
                  <Badge tone={ROLE_TONE[user.role] ?? 'neutral'}>{user.role}</Badge>
                </td>
                <td data-label="Onboarding" className="px-4 py-2">
                  <Badge tone={user.onboardingCompleted ? 'success' : 'warn'}>
                    {user.onboardingCompleted ? 'Done' : 'Pending'}
                  </Badge>
                </td>
                <td
                  data-label="Created"
                  className="text-fg-subtle px-4 py-2"
                  title={formatAbsoluteTime(user.createdAt)}
                >
                  {new Date(user.createdAt).toLocaleDateString()}
                </td>
                <td data-label="Actions" className="px-4 py-2 text-right">
                  {user.role === 'admin' ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={pendingUserId === user.id}
                      onClick={() => onRoleChange(user, 'user')}
                    >
                      {pendingUserId === user.id ? 'Demoting…' : 'Demote'}
                    </Button>
                  ) : (
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={pendingUserId === user.id}
                      onClick={() => onRoleChange(user, 'admin')}
                    >
                      {pendingUserId === user.id ? 'Promoting…' : 'Promote'}
                    </Button>
                  )}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
