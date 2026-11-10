'use client';

// SPDX-License-Identifier: Apache-2.0

// Search box and page-size selector for the admin user table.
import { IconSearch } from '@tabler/icons-react';

import { Input, InputAddon, InputGroup } from '@/components/ui/input';

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
      <InputGroup className="max-w-sm flex-1">
        <InputAddon>
          <IconSearch className="size-4" aria-hidden="true" />
        </InputAddon>
        <Input
          type="text"
          placeholder="Search by email or name"
          value={q}
          onChange={(e) => onQueryChange(e.target.value)}
        />
      </InputGroup>
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
