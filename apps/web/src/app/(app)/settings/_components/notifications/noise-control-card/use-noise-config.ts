// SPDX-License-Identifier: Apache-2.0

// Noise-control state: the editable config with its debounced save and the
// debounced digest preview fetch (quiet hours, severity, cooldown, dedup).

import type { NoiseConfig, Severity } from '@kestrel/shared';
import { useCallback, useEffect, useRef, useState } from 'react';

import { apiFetch, apiMutate } from '@/lib/http/api-client';

export interface DigestPreview {
  breakdown: {
    total: number;
    allowed: number;
    blocked: number;
    bySeverity: { severity: Severity; total: number; allowed: number; blocked: number }[];
    digestMode: boolean;
  };
  allowedPct: number;
  blockedPct: number;
  dailyEstimate: number;
}

export function useNoiseConfig(initialConfig?: NoiseConfig | null) {
  const [config, setConfig] = useState<NoiseConfig>(
    initialConfig ?? {
      dedupTtlSeconds: 300,
      cooldownSeconds: 60,
      quietHours: null,
      timezone: 'UTC',
      minSeverity: 'info',
      minSeverityDuringQuietHours: 'critical',
      dailyDigestMode: false,
    },
  );
  const [saving, setSaving] = useState(false);
  const savingInFlight = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [preview, setPreview] = useState<DigestPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced save: fires 300ms after config stops changing.
  // If a save is already in flight, schedule a trailing save for when it finishes.
  // performSave and fetchPreview are intentionally not in the dep array — they're
  // stable (useCallback with correct deps) and we clear the timer on cleanup.
  useEffect(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      performSave();
    }, 300);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config]);

  const performSave = useCallback(() => {
    // Queue a trailing save if one is already in flight
    if (savingInFlight.current) {
      saveTimerRef.current = setTimeout(() => performSave(), 100);
      return;
    }
    setSaving(true);
    savingInFlight.current = true;
    const configToSave = config;
    apiMutate('/api/notifications/noise-config', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(configToSave),
    })
      .then(() => {
        setSaving(false);
        savingInFlight.current = false;
        // Fetch preview after successful save
        fetchPreview();
      })
      .catch(() => {
        setSaving(false);
        savingInFlight.current = false;
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config]);

  // Debounced preview fetch (only after saves, not on every keystroke)
  const fetchPreview = useCallback(() => {
    if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
    previewTimerRef.current = setTimeout(() => {
      setPreviewLoading(true);
      apiFetch<DigestPreview | null>('/api/alerts/preview-digest')
        .then((data) => setPreview(data))
        .catch(() => setPreview(null))
        .finally(() => setPreviewLoading(false));
    }, 500);
  }, []);

  // Fetch preview once on mount
  useEffect(() => {
    fetchPreview();
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const update = useCallback((updates: Partial<NoiseConfig>) => {
    setConfig((prev) => ({ ...prev, ...updates }));
  }, []);

  return { config, saving, preview, previewLoading, update };
}
