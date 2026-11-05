// SPDX-License-Identifier: Apache-2.0

// Noise-control state: the editable config with its debounced save and the
// digest preview fetch (quiet hours, severity, cooldown, dedup).

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

  const refreshPreview = useCallback(async () => {
    setPreviewLoading(true);
    try {
      setPreview(await apiFetch<DigestPreview | null>('/api/alerts/preview-digest'));
    } catch {
      setPreview(null);
    } finally {
      setPreviewLoading(false);
    }
  }, []);

  const performSave = useCallback(() => {
    // Queue a trailing save if one is already in flight.
    if (savingInFlight.current) {
      saveTimerRef.current = setTimeout(() => performSave(), 100);
      return;
    }
    setSaving(true);
    savingInFlight.current = true;
    apiMutate('/api/notifications/noise-config', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(config),
    })
      .then(() => {
        setSaving(false);
        savingInFlight.current = false;
        // Refresh only after the save has committed, so the preview can never
        // describe settings the server has not stored yet.
        void refreshPreview();
      })
      .catch(() => {
        setSaving(false);
        savingInFlight.current = false;
      });
  }, [config, refreshPreview]);

  // Debounced save: fires 300ms after config stops changing. If a save is
  // already in flight, performSave schedules a trailing save for when it ends.
  useEffect(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      performSave();
    }, 300);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [config, performSave]);

  // Fetch the preview once on mount.
  useEffect(() => {
    void refreshPreview();
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [refreshPreview]);

  const update = useCallback((updates: Partial<NoiseConfig>) => {
    setConfig((prev) => ({ ...prev, ...updates }));
  }, []);

  return { config, saving, preview, previewLoading, update };
}
