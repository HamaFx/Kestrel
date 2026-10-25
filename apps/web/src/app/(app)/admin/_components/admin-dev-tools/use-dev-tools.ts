'use client';

// SPDX-License-Identifier: Apache-2.0

// State + actions for the admin developer tools (impersonation probe,
// impersonate, and resource flush).
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

import { useConfirm } from '@/components/ui/confirm-drawer';
import { apiFetch, apiMutate } from '@/lib/http/api-client';
import { toastApiError } from '@/lib/http/toast-api-error';

interface ProbeResponse {
  enabled: boolean;
}

export interface FlushResult {
  target: string;
  status: 'flushed' | 'unsupported';
  reason?: string;
  affected?: number;
}

interface FlushResponse {
  results?: FlushResult[];
}

export function useDevTools() {
  const [impEnabled, setImpEnabled] = useState(false);
  const [probeLoading, setProbeLoading] = useState(true);
  const [impUserId, setImpUserId] = useState('');
  const [impLoading, setImpLoading] = useState(false);
  const [flushTarget, setFlushTarget] = useState<'cron_locks' | 'cache' | 'sessions' | 'all'>(
    'cron_locks',
  );
  const [flushLoading, setFlushLoading] = useState(false);
  const [flushResults, setFlushResults] = useState<FlushResult[] | null>(null);
  const [confirmEl, confirm] = useConfirm();

  const router = useRouter();

  const probeImp = useCallback(async () => {
    try {
      const data = await apiFetch<ProbeResponse>('/api/admin/impersonate/probe');
      setImpEnabled(data.enabled);
    } catch {
      setImpEnabled(false);
    } finally {
      setProbeLoading(false);
    }
  }, []);

  useEffect(() => {
    void probeImp();
  }, [probeImp]);

  async function handleImpersonate() {
    const userId = impUserId.trim();
    if (!userId) return;

    const ok = await confirm({
      title: 'Impersonate user?',
      description: `You will be signed in as ${userId}. Click "Exit Impersonation" in the banner to return.`,
      confirmLabel: 'Impersonate',
      tone: 'danger',
    });
    if (!ok) return;

    setImpLoading(true);
    try {
      const data = await apiMutate<{ redirect: string }>('/api/admin/impersonate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      router.push(data.redirect);
    } catch (err) {
      toastApiError(err, 'Failed to impersonate');
    } finally {
      setImpLoading(false);
    }
  }

  async function handleFlush() {
    const ok = await confirm({
      title: 'Flush system resources?',
      description: `Target: ${flushTarget}. This may affect production behavior.`,
      confirmLabel: 'Flush',
      tone: 'danger',
    });
    if (!ok) return;

    setFlushLoading(true);
    setFlushResults(null);
    try {
      const data = await apiMutate<FlushResponse>('/api/admin/flush', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: flushTarget }),
      });

      if (data.results) {
        setFlushResults(data.results);
      } else {
        toast.success('Flush completed');
      }
    } catch (err) {
      toastApiError(err, 'Flush failed');
    } finally {
      setFlushLoading(false);
    }
  }

  return {
    impEnabled,
    probeLoading,
    impUserId,
    setImpUserId,
    impLoading,
    flushTarget,
    setFlushTarget,
    flushLoading,
    flushResults,
    confirmEl,
    handleImpersonate,
    handleFlush,
  };
}
