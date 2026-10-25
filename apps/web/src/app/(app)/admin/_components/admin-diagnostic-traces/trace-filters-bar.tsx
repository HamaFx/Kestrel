'use client';

// SPDX-License-Identifier: Apache-2.0

// Correlation-ID search form with clear, refresh and CSV actions.
import { IconDownload, IconRefresh, IconSearch } from '@tabler/icons-react';
import type { Dispatch, FormEvent, SetStateAction } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

import { FILTER_FIELDS, type ExplorerFilters } from './trace-format';

interface TraceFiltersBarProps {
  filters: ExplorerFilters;
  setFilters: Dispatch<SetStateAction<ExplorerFilters>>;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onClear: () => void;
  onRefresh: () => void;
  onExport: () => void;
  showExport: boolean;
}

export function TraceFiltersBar({
  filters,
  setFilters,
  onSubmit,
  onClear,
  onRefresh,
  onExport,
  showExport,
}: TraceFiltersBarProps) {
  return (
    <form
      onSubmit={onSubmit}
      className="border-border bg-bg-elev-1 grid grid-cols-1 gap-3 rounded-sm border p-3 sm:grid-cols-2 lg:grid-cols-5"
      aria-label="Trace search"
    >
      {FILTER_FIELDS.map(({ key, label, placeholder }) => (
        <label key={key} className="flex flex-col gap-1">
          <span className="text-fg-subtle text-xs font-medium">{label}</span>
          <Input
            aria-label={label}
            placeholder={placeholder}
            value={filters[key] ?? ''}
            onChange={(inputEvent) =>
              setFilters((current) => ({ ...current, [key]: inputEvent.target.value }))
            }
          />
        </label>
      ))}
      <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-5">
        <Button type="submit" size="sm">
          <IconSearch className="size-4" aria-hidden="true" />
          Search
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onClear}>
          Clear
        </Button>
        <Button type="button" variant="secondary" size="sm" className="ml-auto" onClick={onRefresh}>
          <IconRefresh className="size-4" aria-hidden="true" />
          Refresh
        </Button>
        {showExport && (
          <Button type="button" variant="ghost" size="sm" onClick={onExport}>
            <IconDownload className="size-4" aria-hidden="true" />
            CSV
          </Button>
        )}
      </div>
    </form>
  );
}
