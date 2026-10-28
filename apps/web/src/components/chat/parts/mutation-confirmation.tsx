// SPDX-License-Identifier: Apache-2.0
// Confirmation card for Mastra mutation drafts. Hoplite Human-in-the-Loop Execution Gate.
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
import { MutationConfirmResultSchema, type MutationDraftPayload } from '@kestrel/shared';
import {
  IconBell,
  IconCheck,
  IconFileText,
  IconLock,
  IconSettings,
  IconShare,
  IconX,
} from '@tabler/icons-react';
import { useCallback, useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { HoldToExecuteButton } from '@/components/ui/hold-to-execute-button';
import { IconBadge } from '@/components/ui/icon-badge';
import { apiMutate } from '@/lib/http/api-client';

const KIND_LABELS: Record<MutationDraftPayload['mutation'], string> = {
  set_alert: 'Alert',
  log_journal: 'Journal entry',
  share_snapshot: 'Share snapshot',
  run_system_action: 'System action',
};

const KIND_ICONS: Record<MutationDraftPayload['mutation'], typeof IconBell> = {
  set_alert: IconBell,
  log_journal: IconFileText,
  share_snapshot: IconShare,
  run_system_action: IconSettings,
};

type CardState =
  | { phase: 'idle' }
  | { phase: 'confirming' }
  | { phase: 'confirmed'; summary: string }
  | { phase: 'declined' }
  | { phase: 'error'; message: string };

export function MutationConfirmationCard({ payload }: { payload: MutationDraftPayload }) {
  const [state, setState] = useState<CardState>({ phase: 'idle' });

  const confirm = useCallback(async () => {
    setState({ phase: 'confirming' });
    try {
      const json = await apiMutate('/api/chat/mutations/confirm', {
        method: 'POST',
        body: JSON.stringify({
          runId: payload.runId,
          confirmationToken: payload.confirmationToken,
        }),
      });
      const parsed = MutationConfirmResultSchema.safeParse(json);
      if (!parsed.success) throw new Error('Confirmation returned an unexpected response.');
      setState({
        phase: 'confirmed',
        summary: parsed.data.output?.summary ?? `${KIND_LABELS[payload.mutation]} confirmed`,
      });
    } catch (error) {
      const message =
        error instanceof Error && error.message
          ? error.message
          : 'Confirmation failed. The token may have expired — please retry the request.';
      setState({ phase: 'error', message });
    }
  }, [payload]);

  const decline = useCallback(async () => {
    setState({ phase: 'confirming' });
    try {
      await apiMutate('/api/chat/mutations/cancel', {
        method: 'POST',
        body: JSON.stringify({
          runId: payload.runId,
          confirmationToken: payload.confirmationToken,
        }),
      });
      setState({ phase: 'declined' });
    } catch (error) {
      const message =
        error instanceof Error && error.message
          ? error.message
          : 'Cancellation failed. The draft may already be complete.';
      setState({ phase: 'error', message });
    }
  }, [payload]);

  const expired = payload.expiresAt <= Date.now();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!expired) {
      const timer = window.setInterval(() => setNow(Date.now()), 5_000);
      return () => window.clearInterval(timer);
    }
  }, [expired]);

  const remainingMin = Math.max(0, Math.ceil((payload.expiresAt - now) / 60_000));

  if (state.phase === 'confirmed') {
    return (
      <Card
        as="section"
        className="border-bull/30 bg-bg-elev-1 rounded-xl border p-4 shadow-sm"
        aria-label="Mutation confirmed"
      >
        <div className="flex items-start gap-2.5">
          <IconCheck className="text-bull mt-0.5 size-4.5 shrink-0" aria-hidden />
          <div className="min-w-0 flex-1 font-mono">
            <div className="text-bull text-[11px] font-semibold uppercase">
              {KIND_LABELS[payload.mutation]} Confirmed &amp; Executed
            </div>
            <div className="text-fg mt-1 font-sans text-sm break-words">{state.summary}</div>
          </div>
        </div>
      </Card>
    );
  }

  if (state.phase === 'declined') {
    return (
      <Card
        as="section"
        className="border-danger/30 bg-bg-elev-1 rounded-xl border p-4 shadow-sm"
        aria-label="Mutation declined"
      >
        <div className="flex items-start gap-2.5">
          <IconX className="text-danger mt-0.5 size-4.5 shrink-0" aria-hidden />
          <div className="min-w-0 flex-1 font-mono">
            <div className="text-danger text-[11px] font-semibold uppercase">
              Directive Cancelled
            </div>
            <div className="text-fg-muted mt-1 font-sans text-sm">
              The {(KIND_LABELS[payload.mutation] ?? 'mutation').toLowerCase()} was cancelled.
              Nothing was modified.
            </div>
          </div>
        </div>
      </Card>
    );
  }

  const KindIcon = KIND_ICONS[payload.mutation] ?? IconSettings;

  return (
    <Card
      as="section"
      className="bg-bg-elev-1 border-brand/40 rounded-xl border p-4 shadow-md transition-all sm:p-5"
      aria-label={`${KIND_LABELS[payload.mutation]} confirmation`}
    >
      <div className="border-border/40 flex flex-wrap items-center justify-between gap-2 border-b pb-3">
        <div className="flex items-center gap-2">
          <IconLock className="text-brand size-4" strokeWidth={1.85} />
          <span className="text-brand font-mono text-[11px] font-semibold tracking-wider uppercase">
            HOPLITE EXECUTION GATE // REQUIRES OPERATOR APPROVAL
          </span>
        </div>
        <span className="text-fg-subtle font-mono text-[11px] uppercase tabular-nums">
          {expired ? 'EXPIRED' : `TTL: ~${remainingMin}m`}
        </span>
      </div>

      <div className="mt-3 flex items-start gap-3">
        <IconBadge tone="brand" size="md" reticle>
          <KindIcon className="size-5" strokeWidth={1.85} aria-hidden />
        </IconBadge>
        <div className="min-w-0 flex-1">
          <div className="text-fg-subtle font-mono text-[11px] font-semibold uppercase">
            {KIND_LABELS[payload.mutation]} Mutation Request
          </div>
          <div className="text-fg mt-0.5 font-sans text-sm font-medium break-words">
            {payload.summary}
          </div>
        </div>
      </div>

      <div className="surface-well mt-3 overflow-hidden rounded-lg font-mono text-[11px]">
        <div className="border-border/40 bg-bg-elev-3 text-brand grid grid-cols-3 border-b px-3 py-1.5 text-[11px] font-semibold uppercase">
          <span>Directive</span>
          <span className="col-span-2">Execution Payload</span>
        </div>
        <div className="text-fg/80 grid grid-cols-3 px-3 py-2">
          <span className="text-fg-subtle">Action</span>
          <span className="text-fg col-span-2 font-semibold">{payload.mutation}</span>
        </div>
        <div className="border-border/20 text-fg/80 grid grid-cols-3 border-t px-3 py-2">
          <span className="text-fg-subtle">Run ID</span>
          <span className="col-span-2 truncate">{payload.runId}</span>
        </div>
      </div>

      {state.phase === 'error' && (
        <div
          role="alert"
          className="border-danger/30 bg-danger/10 text-danger mt-3 rounded-md border px-3 py-2 font-mono text-xs"
        >
          {state.message}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2.5">
        <HoldToExecuteButton
          size="sm"
          onExecute={confirm}
          disabled={state.phase === 'confirming' || expired}
          label={payload.confirmLabel ?? `Hold to Confirm ${KIND_LABELS[payload.mutation]}`}
          executingLabel="Confirming…"
          completedLabel="Confirmed"
          variant="brand"
        />
        <Button
          size="sm"
          variant="secondary"
          onClick={decline}
          disabled={state.phase === 'confirming'}
          className="hover:border-danger/40 hover:text-danger min-h-[44px] min-w-[44px] font-mono text-xs"
        >
          {payload.cancelLabel ?? 'Cancel'}
        </Button>
      </div>
    </Card>
  );
}
