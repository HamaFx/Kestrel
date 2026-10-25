'use client';

// SPDX-License-Identifier: Apache-2.0

// Previous/next pager for the registered-user table.
import { Button } from '@/components/ui/button';

interface UserPaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPrevious: () => void;
  onNext: () => void;
}

export function UserPagination({ page, pageSize, total, onPrevious, onNext }: UserPaginationProps) {
  if (total <= pageSize) return null;

  return (
    <div className="flex items-center justify-between">
      <Button variant="secondary" size="sm" disabled={page === 0} onClick={onPrevious}>
        Previous
      </Button>
      <span className="text-fg-subtle text-sm">
        Page {page + 1} of {Math.ceil(total / pageSize)}
      </span>
      <Button
        variant="secondary"
        size="sm"
        disabled={(page + 1) * pageSize >= total}
        onClick={onNext}
      >
        Next
      </Button>
    </div>
  );
}
