// SPDX-License-Identifier: Apache-2.0

// Filter-box state for the Trace Explorer plus the router navigation used by
// search, clear, row inspection and drawer close.
import { useCallback, useState, type FormEvent } from 'react';

import type { TraceExplorerEvent } from '@/lib/services/admin-dtos';

import type { ExplorerFilters } from './trace-format';

interface TraceRouter {
  push: (href: string) => void;
}

export function useTraceFilters(router: TraceRouter, initial: ExplorerFilters) {
  const [filters, setFilters] = useState<ExplorerFilters>(() => ({ ...initial }));

  const submitSearch = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const params = new URLSearchParams({ tab: 'traces' });
      for (const [key, value] of Object.entries(filters)) {
        if (value?.trim()) params.set(key, value.trim());
      }
      router.push(`/admin?${params.toString()}`);
    },
    [filters, router],
  );

  const clearSearch = useCallback(() => {
    setFilters({});
    router.push('/admin?tab=traces');
  }, [router]);

  const openEvent = useCallback(
    (event: TraceExplorerEvent) => {
      if (event.traceId) {
        router.push(`/admin?tab=traces&trace=${encodeURIComponent(event.traceId)}`);
        return;
      }
      const params = new URLSearchParams({ tab: 'traces' });
      if (event.runId) params.set('runId', event.runId);
      if (event.jobId) params.set('jobId', event.jobId);
      if (event.threadId) params.set('threadId', event.threadId);
      if (event.messageId) params.set('messageId', event.messageId);
      router.push(`/admin?${params.toString()}`);
    },
    [router],
  );

  const closeTrace = useCallback(() => {
    router.push('/admin?tab=traces');
  }, [router]);

  return { filters, setFilters, submitSearch, clearSearch, openEvent, closeTrace };
}
