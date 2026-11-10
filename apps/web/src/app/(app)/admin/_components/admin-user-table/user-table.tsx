'use client';

// SPDX-License-Identifier: Apache-2.0

// Sortable registered-user table with role badges and promote/demote actions.
import { IconArrowDown, IconArrowUp, IconUsers } from '@tabler/icons-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
      className="hover:text-fg focus-visible:ring-brand inline-flex items-center gap-1 rounded text-left font-medium focus:outline-none focus-visible:ring-1"
    >
      {label}
      {sort.key === key ? (
        sort.order === 'asc' ? (
          <IconArrowUp className="text-brand size-3" aria-hidden="true" />
        ) : (
          <IconArrowDown className="text-brand size-3" aria-hidden="true" />
        )
      ) : null}
    </button>
  );

  return (
    <div className="overflow-x-auto rounded-xl border border-white/[0.07]">
      <Table stackOnMobile className="min-w-[600px]">
        <TableHeader>
          <tr>
            <TableHead className="px-4">{headerCell('email', 'Email')}</TableHead>
            <TableHead className="px-4">{headerCell('role', 'Role')}</TableHead>
            <TableHead className="px-4">Onboarding</TableHead>
            <TableHead className="px-4">{headerCell('createdAt', 'Created')}</TableHead>
            <TableHead numeric className="px-4">
              Actions
            </TableHead>
          </tr>
        </TableHeader>
        <TableBody>
          {users.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="px-4 py-6">
                <EmptyState
                  icon={<IconUsers className="size-6" />}
                  title="No users found"
                  description="Registered users will appear here."
                  bare
                />
              </TableCell>
            </TableRow>
          ) : (
            users.map((user) => (
              <TableRow key={user.id} className="row-primary">
                <TableCell className="text-fg px-4">
                  <div className="flex flex-col">
                    <span>{user.email}</span>
                    {user.name && <span className="text-fg-subtle text-xs">{user.name}</span>}
                  </div>
                </TableCell>
                <TableCell data-label="Role" className="px-4">
                  <Badge tone={ROLE_TONE[user.role] ?? 'neutral'}>{user.role}</Badge>
                </TableCell>
                <TableCell data-label="Onboarding" className="px-4">
                  <Badge tone={user.onboardingCompleted ? 'success' : 'warn'} dot>
                    {user.onboardingCompleted ? 'Done' : 'Pending'}
                  </Badge>
                </TableCell>
                <TableCell
                  data-label="Created"
                  className="text-fg-subtle px-4"
                  title={formatAbsoluteTime(user.createdAt)}
                >
                  {new Date(user.createdAt).toLocaleDateString()}
                </TableCell>
                <TableCell data-label="Actions" numeric className="px-4">
                  {user.role === 'admin' ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      loading={pendingUserId === user.id}
                      disabled={pendingUserId === user.id}
                      onClick={() => onRoleChange(user, 'user')}
                    >
                      Demote
                    </Button>
                  ) : (
                    <Button
                      variant="secondary"
                      size="sm"
                      loading={pendingUserId === user.id}
                      disabled={pendingUserId === user.id}
                      onClick={() => onRoleChange(user, 'admin')}
                    >
                      Promote
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
