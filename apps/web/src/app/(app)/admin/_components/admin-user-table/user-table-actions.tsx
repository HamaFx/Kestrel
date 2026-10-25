'use client';

// SPDX-License-Identifier: Apache-2.0

// Refresh and CSV actions above the admin user table.
import { IconDownload } from '@tabler/icons-react';

import { Button } from '@/components/ui/button';

interface UserTableActionsProps {
  showExport: boolean;
  onRefresh: () => void;
  onExport: () => void;
}

export function UserTableActions({ showExport, onRefresh, onExport }: UserTableActionsProps) {
  return (
    <div className="flex items-center justify-end gap-2 pb-3">
      <Button variant="secondary" size="sm" onClick={onRefresh}>
        Refresh
      </Button>
      {showExport && (
        <Button variant="ghost" size="sm" onClick={onExport}>
          <IconDownload className="size-4" aria-hidden="true" />
          CSV
        </Button>
      )}
    </div>
  );
}
