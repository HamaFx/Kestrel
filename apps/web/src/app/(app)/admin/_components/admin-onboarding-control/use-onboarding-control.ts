'use client';

// SPDX-License-Identifier: Apache-2.0

// State + actions for the admin onboarding inspector/reset control.
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

import { useConfirm } from '@/components/ui/confirm-drawer';
import { apiFetch, apiMutate } from '@/lib/http/api-client';
import { toastApiError } from '@/lib/http/toast-api-error';
import type { OnboardingInspectDTO } from '@/lib/services/admin-dtos';

export function useOnboardingControl() {
  const router = useRouter();
  const [targetUserId, setTargetUserId] = useState('');
  const [status, setStatus] = useState<OnboardingInspectDTO | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [fullReset, setFullReset] = useState(false);
  const [confirmEl, confirm] = useConfirm();

  const fetchStatus = useCallback(async (userId: string) => {
    setLoading(true);
    try {
      const data = await apiFetch<OnboardingInspectDTO>(
        `/api/admin/onboarding/inspect?userId=${encodeURIComponent(userId)}`,
      );
      setStatus(data);
      if (!userId) setCurrentUserId(data.userId);
    } catch (err) {
      toastApiError(err, 'Failed to load onboarding status');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchStatus('');
  }, [fetchStatus]);

  async function handleLoadUser(e: React.FormEvent) {
    e.preventDefault();
    const userId = targetUserId.trim();
    await fetchStatus(userId);
  }

  async function handleReset() {
    if (!status) return;
    const ok = await confirm({
      title: 'Reset onboarding?',
      description: `This will reset onboarding for user ${status.userId}.`,
      confirmLabel: 'Reset',
      tone: 'danger',
    });
    if (!ok) return;
    setResetting(true);
    try {
      await apiMutate('/api/admin/onboarding/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: status.userId, mode: fullReset ? 'full' : 'soft' }),
      });
      // Only the current admin should be sent through their own wizard.
      // Resetting another user's onboarding must not navigate the admin away
      // from the dashboard; reload the inspected record instead.
      if (status.userId === currentUserId) {
        toast.success('Onboarding reset. Redirecting...');
        router.push('/onboarding');
      } else {
        toast.success('Onboarding reset');
        await fetchStatus(status.userId);
      }
    } catch (err) {
      toastApiError(err, 'Failed to reset onboarding');
    } finally {
      setResetting(false);
    }
  }

  return {
    targetUserId,
    setTargetUserId,
    status,
    loading,
    resetting,
    fullReset,
    setFullReset,
    confirmEl,
    handleLoadUser,
    handleReset,
  };
}
