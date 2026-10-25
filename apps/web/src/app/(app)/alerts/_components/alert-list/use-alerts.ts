// SPDX-License-Identifier: Apache-2.0

// Alerts server state: query, optimistic toggle/remove mutations,
// confirm-guarded delete, and the active/past view filter.
import type { Alert } from '@kestrel/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import type { useConfirm } from '@/components/ui/confirm-drawer';
import { apiFetch, apiMutate } from '@/lib/http/api-client';

import { describeAlert } from './describe-alert';

export const ALERTS_QUERY_KEY = ['alerts'] as const;

export type AlertFilter = 'all' | 'active' | 'past';

type ConfirmFn = ReturnType<typeof useConfirm>[1];

export function useAlerts(confirm: ConfirmFn) {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<AlertFilter>('all');

  const { data, isLoading, isFetching, isError, error } = useQuery<{ alerts: Alert[] }>({
    queryKey: ALERTS_QUERY_KEY,
    queryFn: async () => {
      return apiFetch<{ alerts: Alert[] }>('/api/alerts');
    },
    staleTime: 10_000,
  });

  const toggle = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      await apiMutate(`/api/alerts/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ active, firedAt: active ? null : undefined }),
      });
    },
    onMutate: async ({ id, active }) => {
      await qc.cancelQueries({ queryKey: ALERTS_QUERY_KEY });
      const previousData = qc.getQueryData<{ alerts: Alert[] }>(ALERTS_QUERY_KEY);
      if (previousData) {
        qc.setQueryData<{ alerts: Alert[] }>(ALERTS_QUERY_KEY, {
          alerts: previousData.alerts.map((a) =>
            a.id === id ? { ...a, active, firedAt: active ? null : a.firedAt } : a,
          ),
        });
      }
      return { previousData };
    },
    onError: (err, _, context) => {
      if (context?.previousData) {
        qc.setQueryData(ALERTS_QUERY_KEY, context.previousData);
      }
      toast.error('Update failed', { description: (err as Error).message });
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ALERTS_QUERY_KEY });
    },
    onSuccess: (_, vars) => {
      toast.success(vars.active ? 'Re-armed' : 'Paused');
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      await apiMutate(`/api/alerts/${id}`, { method: 'DELETE' });
    },
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: ALERTS_QUERY_KEY });
      const previousData = qc.getQueryData<{ alerts: Alert[] }>(ALERTS_QUERY_KEY);
      if (previousData) {
        qc.setQueryData<{ alerts: Alert[] }>(ALERTS_QUERY_KEY, {
          alerts: previousData.alerts.filter((a) => a.id !== id),
        });
      }
      return { previousData };
    },
    onError: (err, _, context) => {
      if (context?.previousData) {
        qc.setQueryData(ALERTS_QUERY_KEY, context.previousData);
      }
      toast.error('Delete failed', { description: (err as Error).message });
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ALERTS_QUERY_KEY });
    },
    onSuccess: () => {
      toast.success('Alert deleted');
    },
  });

  async function handleDelete(alert: Alert) {
    const ok = await confirm({
      title: 'Delete this alert?',
      description: describeAlert(alert),
      confirmLabel: 'Delete',
      tone: 'danger',
    });
    if (ok) remove.mutate(alert.id);
  }

  const filteredAlerts = useMemo(
    () =>
      data?.alerts.filter((a) => {
        if (filter === 'active') return a.active && !a.firedAt;
        if (filter === 'past') return !!a.firedAt || !a.active;
        return true;
      }),
    [data?.alerts, filter],
  );

  const refresh = () => qc.invalidateQueries({ queryKey: ALERTS_QUERY_KEY });

  return {
    data,
    isLoading,
    isFetching,
    isError,
    error,
    filter,
    setFilter,
    toggle,
    remove,
    handleDelete,
    filteredAlerts,
    refresh,
  };
}
