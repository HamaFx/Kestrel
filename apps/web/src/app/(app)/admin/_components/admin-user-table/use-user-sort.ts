// SPDX-License-Identifier: Apache-2.0

// Sort-key state for the admin user table headers.
import { useCallback, useState } from 'react';

import type { SortState } from './user-table-format';

export function useUserSort() {
  const [sort, setSort] = useState<SortState>({ key: 'createdAt', order: 'desc' });

  const handleSort = useCallback((key: SortState['key']) => {
    setSort((prev) =>
      prev.key === key
        ? { key, order: prev.order === 'asc' ? 'desc' : 'asc' }
        : { key, order: 'asc' },
    );
  }, []);

  return { sort, handleSort };
}
