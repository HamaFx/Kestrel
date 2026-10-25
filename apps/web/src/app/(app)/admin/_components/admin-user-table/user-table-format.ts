// SPDX-License-Identifier: Apache-2.0

// Sorting, role-tone and CSV-export helpers for the admin user table.
import type { BadgeTone } from '@/components/ui/badge';
import { downloadCSV } from '@/lib/formatters/format-number';
import type { UserSummary } from '@/lib/services/admin-dtos';

export const PAGE_SIZES = [10, 25, 50];

export interface SortState {
  key: 'email' | 'role' | 'createdAt';
  order: 'asc' | 'desc';
}

export const ROLE_TONE: Record<string, BadgeTone> = {
  admin: 'brand',
  user: 'neutral',
};

export function sortUsers(users: UserSummary[], sort: SortState): UserSummary[] {
  return [...users].sort((a, b) => {
    const { key, order } = sort;
    const dir = order === 'asc' ? 1 : -1;
    if (key === 'email') return (a.email ?? '').localeCompare(b.email ?? '') * dir;
    if (key === 'role') return a.role.localeCompare(b.role) * dir;
    return (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) * dir;
  });
}

export function exportUsersCsv(users: UserSummary[]) {
  downloadCSV(
    users.map((u) => ({
      email: u.email,
      name: u.name ?? '',
      role: u.role,
      onboardingCompleted: u.onboardingCompleted ? 'Done' : 'Pending',
      createdAt: u.createdAt,
    })),
    `users-${new Date().toISOString().slice(0, 10)}.csv`,
  );
}
