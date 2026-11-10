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

// SPDX-License-Identifier: Apache-2.0

// <Table> — PanelUI-inspired dark hairline table primitive with built-in support
// for Kestrel's mobile `.table-stack` card transformation.

import type {
  HTMLAttributes,
  TableHTMLAttributes,
  TdHTMLAttributes,
  ThHTMLAttributes,
} from 'react';

import { cn } from '@/lib/formatters/cn';

export function Table({
  stackOnMobile = false,
  className,
  ...props
}: TableHTMLAttributes<HTMLTableElement> & { stackOnMobile?: boolean }) {
  return (
    <table
      data-slot="table"
      className={cn(
        'w-full border-collapse text-left text-sm',
        stackOnMobile && 'table-stack',
        className,
      )}
      {...props}
    />
  );
}

export function TableHeader({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead
      data-slot="table-header"
      className={cn(
        'bg-[#101113] text-fg-subtle font-mono text-[9px] tracking-[0.12em] uppercase',
        className,
      )}
      {...props}
    />
  );
}

export function TableBody({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <tbody
      data-slot="table-body"
      className={cn('divide-y divide-white/[0.06]', className)}
      {...props}
    />
  );
}

export function TableRow({ className, ...props }: HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      data-slot="table-row"
      className={cn('group bg-[#121315] transition-colors hover:bg-white/[0.03]', className)}
      {...props}
    />
  );
}

export function TableHead({
  numeric = false,
  className,
  ...props
}: ThHTMLAttributes<HTMLTableCellElement> & { numeric?: boolean }) {
  return (
    <th
      scope="col"
      data-slot="table-head"
      className={cn('px-3 py-2 font-semibold select-none', numeric && 'text-right', className)}
      {...props}
    />
  );
}

export function TableCell({
  numeric = false,
  className,
  ...props
}: TdHTMLAttributes<HTMLTableCellElement> & { numeric?: boolean }) {
  return (
    <td
      data-slot="table-cell"
      className={cn('px-3 py-2', numeric && 'text-right font-mono tabular-nums', className)}
      {...props}
    />
  );
}
