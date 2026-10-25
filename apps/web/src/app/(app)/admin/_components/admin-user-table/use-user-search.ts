// SPDX-License-Identifier: Apache-2.0

// Search, paging and page-size state for the admin user table, including the
// debounce that resets to the first page on a new query.
import { useCallback, useEffect, useState } from 'react';

export function useUserSearch() {
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQ(q.trim());
      setPage(0);
    }, 250);
    return () => clearTimeout(timer);
  }, [q]);

  const changePageSize = useCallback((size: number) => {
    setPageSize(size);
    setPage(0);
  }, []);

  return { page, setPage, pageSize, changePageSize, q, setQ, debouncedQ };
}
