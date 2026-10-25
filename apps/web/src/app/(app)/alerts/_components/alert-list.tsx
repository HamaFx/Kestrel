'use client';

/**
 * Copyright 2026 Kestrel
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import type { Alert } from '@kestrel/shared';
import {
  IconActivity,
  IconArrowRight,
  IconBell,
  IconBellOff,
  IconBellRinging,
  IconBrandTelegram,
  IconChartBar,
  IconMail,
  IconPlus,
  IconRefresh,
  IconTrash,
  IconTrendingUp,
} from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-drawer';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { EmptyState } from '@/components/ui/empty-state';
import { Segmented } from '@/components/ui/segmented';
import { StaleIndicator } from '@/components/ui/stale-indicator';
import { Tooltip } from '@/components/ui/tooltip';
import { apiFetch, apiMutate } from '@/lib/api-client';
import { cn } from '@/lib/cn';
import { formatRelative } from '@/lib/format';

import { AlertForm } from './alert-form';

export const ALERTS_QUERY_KEY = ['alerts'] as const;

export function AlertList() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<'all' | 'active' | 'past'>('all');
  const [confirmEl, confirm] = useConfirm();

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
      description: describe(alert),
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

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Segmented<'all' | 'active' | 'past'>
            value={filter}
            onChange={setFilter}
            ariaLabel="Filter alerts"
            options={[
              { value: 'all', label: 'All' },
              { value: 'active', label: 'Active' },
              { value: 'past', label: 'Past' },
            ]}
            variant="solid"
            size="sm"
          />
          {data && data.alerts.length > 0 ? (
            <Button type="button" size="sm" onClick={() => setOpen(true)}>
              <IconPlus className="size-4" />
              New alert
            </Button>
          ) : null}
        </div>
        <StaleIndicator isFetching={isFetching && !isLoading} />
      </div>

      {isLoading ? (
        <p role="status" className="text-fg-muted px-1 text-sm">
          Loading alerts…
        </p>
      ) : isError ? (
        <p className="text-danger px-1 text-sm" role="alert">
          Failed to load: {(error as Error)?.message}
        </p>
      ) : data?.alerts.length === 0 ? (
        <EmptyState
          tone="muted"
          icon={<IconBell className="size-7" strokeWidth={1.75} />}
          title="No alerts configured"
          description="Create price or indicator alerts to get notified when the market hits your levels."
          action={
            <Button type="button" onClick={() => setOpen(true)}>
              <IconPlus className="size-4" />
              Create alert
            </Button>
          }
        />
      ) : filteredAlerts?.length === 0 ? (
        <EmptyState
          tone="muted"
          icon={
            filter === 'past' ? (
              <IconBellRinging className="size-7" strokeWidth={1.75} />
            ) : (
              <IconBellOff className="size-7" strokeWidth={1.75} />
            )
          }
          title={`No ${filter} alerts`}
          description={
            filter === 'past'
              ? 'No triggered or paused alerts in this view yet.'
              : 'No currently active alerts — create a new alert or resume a paused one.'
          }
          action={
            filter !== 'all' ? (
              <Button type="button" variant="secondary" size="sm" onClick={() => setFilter('all')}>
                Show all alerts
              </Button>
            ) : undefined
          }
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {filteredAlerts?.map((a) => (
            <AlertRow
              key={a.id}
              alert={a}
              onToggle={() => toggle.mutate({ id: a.id, active: !a.active })}
              onDelete={() => void handleDelete(a)}
            />
          ))}
        </ul>
      )}

      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>New alert</DrawerTitle>
            <DrawerDescription>Set a price, indicator, or candle-close trigger.</DrawerDescription>
          </DrawerHeader>
          <AlertForm
            onCreated={() => {
              qc.invalidateQueries({ queryKey: ALERTS_QUERY_KEY });
              setOpen(false);
            }}
          />
        </DrawerContent>
      </Drawer>

      {confirmEl}
    </div>
  );
}

interface AlertRowProps {
  alert: Alert;
  onToggle: () => void;
  onDelete: () => void;
}

function AlertRow({ alert, onToggle, onDelete }: AlertRowProps) {
  const RuleIcon = ruleIcon(alert);
  const StatusIcon = alert.active ? IconBell : alert.firedAt ? IconBellRinging : IconBellOff;
  const statusTone = alert.active ? 'text-fg' : alert.firedAt ? 'text-warn' : 'text-fg-subtle';

  return (
    <li className="border-border bg-bg-elev-1 relative overflow-hidden rounded-xl border transition-all duration-200 hover:shadow-lg">
      <div
        className={cn(
          'bg-bg-elev-1 flex w-full items-center gap-3 p-4 transition-opacity duration-200',
          !alert.active && 'opacity-65 saturate-50',
        )}
      >
        <div className="relative">
          <span
            aria-hidden
            className={cn(
              'bg-bg-elev-2 inline-flex size-11 shrink-0 items-center justify-center rounded-lg border border-white/5',
              statusTone,
            )}
          >
            <StatusIcon className="size-5" strokeWidth={1.75} />
          </span>
          {alert.active && !alert.firedAt && (
            <span className="absolute -top-1 -right-1 flex h-3 w-3">
              <span className="bg-brand absolute inline-flex h-full w-full animate-ping rounded-full opacity-75"></span>
              <span className="bg-brand border-bg relative inline-flex h-3 w-3 rounded-full border-2"></span>
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1 py-0.5">
          <div className="flex items-center gap-2">
            <div className="text-fg flex items-center gap-1.5 text-sm font-semibold tabular-nums">
              <RuleIcon className="text-fg-muted size-4 shrink-0" aria-hidden="true" />
              <span className="truncate">{describe(alert)}</span>
            </div>
            <div className="ml-1.5 flex items-center gap-1">
              {alert.channels.includes('email') && (
                <IconMail
                  className="text-fg-muted size-3.5"
                  strokeWidth={2}
                  title="Email delivery"
                />
              )}
              {alert.channels.includes('telegram') && (
                <IconArrowRight
                  className="text-fg size-3.5"
                  strokeWidth={2}
                  title="Telegram delivery"
                />
              )}
              {alert.channels.includes('telegram-bot') && (
                <IconBrandTelegram
                  className="text-fg size-3.5"
                  strokeWidth={2}
                  title="Telegram personal bot delivery"
                />
              )}
            </div>
          </div>
          <p className="text-fg-subtle mt-1 truncate text-xs font-medium">
            {alert.firedAt
              ? `Triggered ${formatRelative(alert.firedAt)}`
              : alert.active
                ? `Watching since ${formatRelative(alert.createdAt)}`
                : `Paused`}
            {alert.note ? <span className="text-fg-muted"> · {alert.note}</span> : ''}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <Tooltip label={alert.active ? 'Pause' : 'Re-arm'}>
            <button
              type="button"
              onClick={onToggle}
              aria-label={alert.active ? 'Pause alert' : 'Re-arm alert'}
              className="text-fg-muted hover:text-fg hover:bg-bg-elev-2 inline-flex size-10 items-center justify-center rounded-lg transition-colors"
            >
              {alert.active ? (
                <IconBellOff className="size-4" />
              ) : (
                <IconRefresh className="size-4" />
              )}
            </button>
          </Tooltip>
          <Tooltip label="Delete">
            <button
              type="button"
              onClick={onDelete}
              aria-label="Delete alert"
              className="text-danger/70 hover:text-danger hover:bg-danger/10 inline-flex size-10 items-center justify-center rounded-lg transition-colors"
            >
              <IconTrash className="size-4" />
            </button>
          </Tooltip>
        </div>
      </div>
    </li>
  );
}

function ruleIcon(a: Alert) {
  switch (a.rule.type) {
    case 'priceCross':
      return IconTrendingUp;
    case 'indicatorCross':
      return IconActivity;
    case 'candleClose':
      return IconChartBar;
  }
}

function describe(a: Alert): string {
  const r = a.rule;
  switch (r.type) {
    case 'priceCross':
      return `${r.symbol} price ${r.direction} ${r.level}`;
    case 'candleClose':
      return `${r.symbol} ${r.tf.toUpperCase()} close ${r.direction} ${r.level}`;
    case 'indicatorCross':
      return `${r.symbol} ${r.tf.toUpperCase()} ${r.indicator.toUpperCase()} ${r.direction} ${r.level}`;
  }
}
