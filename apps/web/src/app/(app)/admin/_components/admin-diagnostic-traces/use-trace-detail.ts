// SPDX-License-Identifier: Apache-2.0

// Trace-detail state for the drawer: loads the trace plus its correlated
// explorer rows and guards against late responses after the drawer closes.
import { useCallback, useEffect, useRef, useState } from 'react';

import { apiFetch } from '@/lib/http/api-client';
import { toastApiError } from '@/lib/http/toast-api-error';
import type {
  DiagnosticTraceDetail,
  TraceExplorerEvent,
  TraceExplorerResponse,
} from '@/lib/services/admin-dtos';

export function useTraceDetail(traceId: string | null) {
  const [detail, setDetail] = useState<DiagnosticTraceDetail | null>(null);
  const [detailEvents, setDetailEvents] = useState<TraceExplorerEvent[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const detailRequestRef = useRef(0);
  const [detailError, setDetailError] = useState<string | null>(null);

  const fetchDetail = useCallback(async (id: string) => {
    const requestId = ++detailRequestRef.current;
    setDetailLoading(true);
    setDetailError(null);
    try {
      const [detailResponse, explorerResponse] = await Promise.all([
        apiFetch<{ trace: DiagnosticTraceDetail }>(`/api/admin/diagnostics/trace/${id}`),
        apiFetch<TraceExplorerResponse>(
          `/api/admin/diagnostics/explorer?traceId=${encodeURIComponent(id)}&limit=100`,
        ),
      ]);
      if (requestId === detailRequestRef.current) {
        setDetail(detailResponse.trace);
        setDetailEvents(explorerResponse.events);
      }
    } catch (err) {
      if (requestId !== detailRequestRef.current) return;
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setDetailError(msg);
      toastApiError(err, 'Failed to load trace detail');
    } finally {
      if (requestId === detailRequestRef.current) setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    if (traceId) {
      void fetchDetail(traceId);
    } else {
      detailRequestRef.current += 1;
      setDetail(null);
      setDetailEvents([]);
      setDetailError(null);
      setDetailLoading(false);
    }
  }, [traceId, fetchDetail]);

  return { detail, detailEvents, detailLoading, detailError };
}
