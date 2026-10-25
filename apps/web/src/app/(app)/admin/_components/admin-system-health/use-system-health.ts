'use client';

// SPDX-License-Identifier: Apache-2.0

// Data + refresh lifecycle for the System Health dashboard: initial load,
// 30s polling while the tab is visible, and abort on unmount.
import { useCallback, useEffect, useRef, useState } from 'react';

import { apiFetch } from '@/lib/http/api-client';
import { toastApiError } from '@/lib/http/toast-api-error';
import type { HealthSloData } from '@/lib/services/admin-dtos';

export function useSystemHealth() {
  const [data, setData] = useState<HealthSloData | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [windowHours, setWindowHours] = useState(24);
  const abortRef = useRef<AbortController | null>(null);
  const isVisibleRef = useRef(false);
  const requestIdRef = useRef(0);
  const windowHoursRef = useRef(windowHours);

  useEffect(() => {
    windowHoursRef.current = windowHours;
  }, [windowHours]);

  const fetchHealth = useCallback(async (hours = windowHoursRef.current) => {
    const requestId = ++requestIdRef.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setFetchError(null);
    try {
      const json = await apiFetch<HealthSloData>(`/api/admin/health-slo?hours=${hours}`, {
        signal: controller.signal,
      });
      if (requestId === requestIdRef.current) setData(json);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      if (requestId !== requestIdRef.current) return;
      const msg = err instanceof Error ? err.message : 'Failed to load system health';
      setFetchError(msg);
      toastApiError(err, msg);
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    isVisibleRef.current = document.visibilityState === 'visible';
    if (isVisibleRef.current) {
      void fetchHealth();
    }

    const interval = setInterval(() => {
      if (isVisibleRef.current) {
        void fetchHealth();
      }
    }, 30_000);

    const handleVisibility = () => {
      const visible = document.visibilityState === 'visible';
      isVisibleRef.current = visible;
      if (visible) {
        void fetchHealth();
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      requestIdRef.current += 1;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
      abortRef.current?.abort();
    };
  }, [fetchHealth]);

  return { data, loading, fetchError, windowHours, setWindowHours, fetchHealth };
}
