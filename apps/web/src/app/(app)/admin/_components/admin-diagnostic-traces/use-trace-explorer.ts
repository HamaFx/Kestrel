// SPDX-License-Identifier: Apache-2.0

// Explorer timeline state: fetch lifecycle plus the URL-query driven reload
// that keeps the table in sync with the admin tab's correlation params.
import { useCallback, useEffect, useState } from 'react';

import { apiFetch } from '@/lib/http/api-client';
import { toastApiError } from '@/lib/http/toast-api-error';
import type { TraceExplorerEvent, TraceExplorerResponse } from '@/lib/services/admin-dtos';

import type { ExplorerFilters } from './trace-format';

export function useTraceExplorer(query: ExplorerFilters) {
  const { traceId, runId, jobId, threadId, messageId } = query;

  const [events, setEvents] = useState<TraceExplorerEvent[]>([]);
  const [stats, setStats] = useState<TraceExplorerResponse['stats']>({
    total: 0,
    bySource: {},
    failures: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchExplorer = useCallback(async (filters: ExplorerFilters = {}) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: '100' });
      for (const [key, value] of Object.entries(filters)) {
        if (value) params.set(key, value);
      }
      const data = await apiFetch<TraceExplorerResponse>(
        `/api/admin/diagnostics/explorer?${params.toString()}`,
      );
      setEvents(data.events);
      setStats(data.stats);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setError(msg);
      toastApiError(err, 'Failed to load diagnostic timeline');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchExplorer({ traceId, runId, jobId, threadId, messageId });
  }, [fetchExplorer, traceId, runId, jobId, threadId, messageId]);

  return { events, stats, loading, error, fetchExplorer };
}
