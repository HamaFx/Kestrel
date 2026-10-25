// SPDX-License-Identifier: Apache-2.0

// SSE lifecycle for the live log stream: probe before connecting, generation
// guards against stale responses, and exponential-backoff reconnect.
import { useCallback, useEffect, useRef, useState } from 'react';

import type { LogStatus } from './log-format';

const MAX_LINES = 200;
const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 30_000;

export function useLogStream() {
  const [lines, setLines] = useState<string[]>([]);
  const [status, setStatus] = useState<LogStatus>('idle');
  const [notEnabledMsg, setNotEnabledMsg] = useState<string>('');
  const [isPaused, setIsPaused] = useState(false);

  const sourceRef = useRef<EventSource | null>(null);
  const reconnectAttempt = useRef(0);
  const reconnectTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pausedRef = useRef(false);
  const mountedRef = useRef(true);
  const connectGenerationRef = useRef(0);
  const probeAbortRef = useRef<AbortController | null>(null);

  // Keep pausedRef in sync so the message handler reads the latest value.
  useEffect(() => {
    pausedRef.current = isPaused;
  }, [isPaused]);

  const disconnect = useCallback((updateStatus = false) => {
    connectGenerationRef.current += 1;
    probeAbortRef.current?.abort();
    probeAbortRef.current = null;
    if (reconnectTimeout.current !== null) {
      clearTimeout(reconnectTimeout.current);
      reconnectTimeout.current = null;
    }
    sourceRef.current?.close();
    sourceRef.current = null;
    if (updateStatus && mountedRef.current) setStatus('idle');
  }, []);

  const connect = useCallback(
    async (resetBackoff = true) => {
      disconnect();
      const generation = connectGenerationRef.current;
      if (resetBackoff) reconnectAttempt.current = 0;
      setNotEnabledMsg('');
      setStatus('connecting');

      // Pre-flight: fetch to distinguish 503 (not enabled) / 403 (production) from network errors.
      const probeController = new AbortController();
      probeAbortRef.current = probeController;
      try {
        const res = await fetch('/api/admin/logs/stream?probe=1', {
          method: 'GET',
          signal: probeController.signal,
        });
        if (res.status === 403) {
          if (!mountedRef.current || generation !== connectGenerationRef.current) return;
          setNotEnabledMsg(
            'Log streaming is disabled in production. Run locally with ENABLE_LOG_STREAM=true to view live logs.',
          );
          setStatus('production');
          return;
        }
        if (res.status === 503) {
          let message = 'Log streaming is not enabled.';
          try {
            const body = await res.json();
            if (typeof body?.error?.message === 'string') message = body.error.message;
          } catch {
            // Use the generic disabled message when the response is not JSON.
          }
          if (!mountedRef.current || generation !== connectGenerationRef.current) return;
          setNotEnabledMsg(message);
          setStatus('not_enabled');
          return;
        }
        if (!res.ok) {
          if (!mountedRef.current || generation !== connectGenerationRef.current) return;
          setNotEnabledMsg(`Log stream unavailable (HTTP ${res.status}).`);
          setStatus('error');
          return;
        }
      } catch {
        // network error — EventSource will also fail, handled by onerror below.
      } finally {
        if (probeAbortRef.current === probeController) probeAbortRef.current = null;
      }

      if (!mountedRef.current || generation !== connectGenerationRef.current) return;

      const source = new EventSource('/api/admin/logs/stream');
      sourceRef.current = source;

      source.onopen = () => {
        if (
          !mountedRef.current ||
          generation !== connectGenerationRef.current ||
          sourceRef.current !== source
        )
          return;
        setStatus('connected');
        reconnectAttempt.current = 0;
      };

      source.onmessage = (event) => {
        if (!mountedRef.current || sourceRef.current !== source || pausedRef.current) return;
        const line = typeof event.data === 'string' ? event.data : String(event.data);
        setLines((prev) => {
          const next = [...prev, line];
          return next.length > MAX_LINES ? next.slice(next.length - MAX_LINES) : next;
        });
      };

      source.onerror = () => {
        if (
          !mountedRef.current ||
          generation !== connectGenerationRef.current ||
          sourceRef.current !== source
        )
          return;
        source.close();
        sourceRef.current = null;
        setStatus('error');
        // Exponential backoff reconnect
        const delay = Math.min(
          RECONNECT_MAX_MS,
          RECONNECT_BASE_MS * Math.pow(2, reconnectAttempt.current),
        );
        reconnectAttempt.current++;
        reconnectTimeout.current = setTimeout(() => {
          if (mountedRef.current) void connect(false);
        }, delay);
      };
    },
    [disconnect],
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      mountedRef.current = false;
      disconnect();
    };
  }, [disconnect]);

  const clear = useCallback(() => {
    setLines([]);
  }, []);

  return { lines, status, notEnabledMsg, isPaused, setIsPaused, clear, connect, disconnect };
}
