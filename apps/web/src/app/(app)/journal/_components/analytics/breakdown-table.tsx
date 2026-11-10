'use client';

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

// Reusable sortable breakdown table for by-symbol / by-session / by-hour / by-day / by-tag stats.
import { useMemo, useState } from 'react';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/formatters/cn';

interface BreakdownRow {
  label: string;
  trades: number;
  /** Null when the bucket had no closed trade to measure one from. */
  winRate: number | null;
  /** Null when no trade in the bucket carries an R multiple. */
  totalR: number | null;
  expectancy?: number | null;
}

interface BreakdownTableProps {
  title: string;
  data: readonly BreakdownRow[];
  sortBy?: 'trades' | 'winRate' | 'totalR' | 'expectancy';
}

type SortKey = 'label' | 'trades' | 'winRate' | 'totalR' | 'expectancy';
type SortDir = 'asc' | 'desc';

function sortValue(row: BreakdownRow, key: SortKey): number | string | null {
  if (key === 'label') return row.label;
  if (key === 'expectancy') return row.expectancy ?? null;
  if (key === 'trades') return row.trades;
  if (key === 'winRate') return row.winRate;
  return row.totalR;
}

export function BreakdownTable({ title, data, sortBy = 'totalR' }: BreakdownTableProps) {
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({
    key: sortBy,
    dir: 'desc',
  });

  const rows = useMemo(() => {
    const sorted = [...data];
    sorted.sort((a, b) => {
      const { key, dir } = sort;
      const aVal = sortValue(a, key);
      const bVal = sortValue(b, key);
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return dir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      // Unmeasured (null) rows sort after measured ones in either direction.
      if (aVal === null && bVal === null) return 0;
      if (bVal === null) return -1;
      if (aVal === null) return 1;
      const aNum = typeof aVal === 'number' ? aVal : 0;
      const bNum = typeof bVal === 'number' ? bVal : 0;
      return dir === 'asc' ? aNum - bNum : bNum - aNum;
    });
    return sorted;
  }, [data, sort]);

  const header = (key: SortKey, label: string, numeric = true) => {
    const active = sort.key === key;
    const ariaSort = active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none';
    return (
      <TableHead
        role="columnheader"
        aria-sort={ariaSort}
        numeric={numeric}
        className="text-caption text-fg-subtle cursor-pointer font-bold tracking-wider uppercase"
        onClick={() =>
          setSort((prev) => ({
            key,
            dir: prev.key === key && prev.dir === 'desc' ? 'asc' : 'desc',
          }))
        }
      >
        {label}
      </TableHead>
    );
  };

  return (
    <div
      className="border-border bg-bg-elev-1 overflow-x-auto rounded-xl border"
      role="table"
      aria-label={title}
    >
      <div className="border-border border-b px-3 py-2">
        <span className="text-body-sm text-fg font-semibold">{title}</span>
      </div>
      <Table stackOnMobile>
        <TableHeader className="bg-bg-elev-2">
          <tr>
            {header('label', 'Label', false)}
            {header('trades', 'Trades')}
            {header('winRate', 'Win Rate')}
            {header('totalR', 'Total R')}
            {header('expectancy', 'Expectancy')}
          </tr>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow
              key={row.label}
              className="row-primary border-divider bg-transparent border-b last:border-b-0"
            >
              <TableCell className="text-fg font-medium">{row.label}</TableCell>
              <TableCell data-label="Trades" numeric className="text-fg-muted">
                {row.trades}
              </TableCell>
              <TableCell
                data-label="Win rate"
                numeric
                className={cn(
                  'font-medium',
                  row.winRate === null
                    ? 'text-fg-muted'
                    : row.winRate > 0.55
                      ? 'text-bull'
                      : row.winRate < 0.4
                        ? 'text-bear'
                        : 'text-fg-muted',
                )}
              >
                {row.winRate === null ? '—' : `${(row.winRate * 100).toFixed(0)}%`}
              </TableCell>
              <TableCell
                data-label="Total R"
                numeric
                className={cn(
                  'font-medium',
                  row.totalR === null
                    ? 'text-fg-muted'
                    : row.totalR > 0
                      ? 'text-bull'
                      : row.totalR < 0
                        ? 'text-bear'
                        : 'text-fg-muted',
                )}
              >
                {row.totalR === null
                  ? '—'
                  : `${row.totalR > 0 ? '+' : ''}${row.totalR.toFixed(2)}R`}
              </TableCell>
              <TableCell data-label="Expectancy" numeric className="text-fg-muted">
                {row.expectancy == null
                  ? '—'
                  : `${row.expectancy > 0 ? '+' : ''}${row.expectancy.toFixed(2)}R`}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
