'use client';

// SPDX-License-Identifier: Apache-2.0

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

// Admin user table shell: search/paging state, the role-action hook and the
// table, filter, action and pagination sections.
import { SettingsSection } from '@/app/(app)/settings/_components/settings-section';
import { SkeletonCard } from '@/components/ui/skeleton';

import { AdminErrorBlock } from '../admin-error-block';
import { useAdminUsers } from './use-admin-users';
import { useUserRoleActions } from './use-user-role-actions';
import { useUserSearch } from './use-user-search';
import { useUserSort } from './use-user-sort';
import { UserFilters } from './user-filters';
import { UserPagination } from './user-pagination';
import { UserTable } from './user-table';
import { UserTableActions } from './user-table-actions';
import { exportUsersCsv, sortUsers } from './user-table-format';

export function AdminUserTable() {
  const { page, setPage, pageSize, changePageSize, q, setQ, debouncedQ } = useUserSearch();
  const { users, total, loading, fetchError, fetchUsers } = useAdminUsers(
    page,
    pageSize,
    debouncedQ,
  );
  const { sort, handleSort } = useUserSort();
  const { pendingUserId, handleRoleChange, confirmEl } = useUserRoleActions(fetchUsers);

  if (loading) {
    return <SkeletonCard lines={4} />;
  }

  if (fetchError) {
    return (
      <SettingsSection title="Users" description="Registered users.">
        <AdminErrorBlock message={fetchError} onRetry={fetchUsers} />
      </SettingsSection>
    );
  }

  const sortedUsers = sortUsers(users, sort);
  const start = total === 0 ? 0 : page * pageSize + 1;
  const end = Math.min((page + 1) * pageSize, total);
  const description = `Total: ${total}${total > 0 ? ` • ${start}-${end}` : ''}`;

  return (
    <>
      <SettingsSection title="Users" description={description}>
        <UserTableActions
          showExport={users.length > 0}
          onRefresh={fetchUsers}
          onExport={() => exportUsersCsv(sortedUsers)}
        />
        <UserFilters
          q={q}
          onQueryChange={setQ}
          pageSize={pageSize}
          onPageSizeChange={changePageSize}
        />
        <UserTable
          users={sortedUsers}
          sort={sort}
          onSort={handleSort}
          pendingUserId={pendingUserId}
          onRoleChange={handleRoleChange}
        />
        <UserPagination
          page={page}
          pageSize={pageSize}
          total={total}
          onPrevious={() => setPage((p) => Math.max(0, p - 1))}
          onNext={() => setPage((p) => p + 1)}
        />
      </SettingsSection>
      {confirmEl}
    </>
  );
}
