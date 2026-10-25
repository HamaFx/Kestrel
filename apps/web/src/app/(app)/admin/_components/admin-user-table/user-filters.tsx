'use client';

// SPDX-License-Identifier: Apache-2.0

// Search box and page-size selector for the admin user table.
import { IconSearch } from '@tabler/icons-react';

import { Input } from '@/components/ui/input';

import { PAGE_SIZES } from './user-table-format';

interface UserFiltersProps {
  q: string;
  onQueryChange: (value: string) => void;
  pageSize: number;
  onPageSizeChange: (size: number) => void;
}

export function UserFilters({ q, onQueryChange, pageSize, onPageSizeChange }: UserFiltersProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="relative max-w-sm flex-1">
        <IconSearch className="text-fg-subtle absolute top-1/2 left-3 size-4 -translate-y-1/2" />
        <Input
          type="text"
          placeholder="Search by email or name"
          value={q}
          onChange={(e) => onQueryChange(e.target.value)}
          className="pl-10"
        />
      </div>
      <div className="flex items-center gap-2">
        <label htmlFor="page-size" className="text-fg-subtle text-sm">
          Show
        </label>
        <select
          id="page-size"
          value={pageSize}
          onChange={(e) => onPageSizeChange(Number(e.target.value))}
          className="bg-bg-elev-1 border-border text-fg rounded-sm border px-2 py-1 text-sm"
        >
          {PAGE_SIZES.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
