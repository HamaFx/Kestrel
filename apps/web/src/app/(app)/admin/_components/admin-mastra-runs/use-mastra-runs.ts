// SPDX-License-Identifier: Apache-2.0

// Mastra-run list state: window selection, fetch lifecycle and refresh.
import { useCallback, useEffect, useState } from 'react';

import { apiFetch } from '@/lib/http/api-client';
import { toastApiError } from '@/lib/http/toast-api-error';

import type { MastraRun, MastraRunsResponse } from './mastra-runs-types';

export function useMastraRuns() {
  const [runs, setRuns] = useState<MastraRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [hours, setHours] = useState(72);

  const fetchRuns = useCallback(async (windowHours: number) => {
    setLoading(true);
    setFetchError(null);
    try {
      const data = await apiFetch<MastraRunsResponse>(
        `/api/admin/mastra-runs?hours=${windowHours}&limit=200`,
      );
      setRuns(data.runs);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load Mastra runs';
      setFetchError(msg);
      toastApiError(err, msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchRuns(hours);
  }, [hours, fetchRuns]);

  return { runs, loading, fetchError, hours, setHours, fetchRuns };
}
