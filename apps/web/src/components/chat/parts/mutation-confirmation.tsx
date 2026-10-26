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
      <Card as="section" className="rounded-xl border border-emerald-500/30 bg-[#111114] p-4 shadow-sm" aria-label="Mutation confirmed">
        <div className="flex items-start gap-2.5">
          <IconCheck className="mt-0.5 size-4.5 shrink-0 text-emerald-400" aria-hidden />
          <div className="min-w-0 flex-1 font-mono">
            <div className="text-[11px] font-semibold text-emerald-400 uppercase">
              {KIND_LABELS[payload.mutation]} Confirmed & Executed
            </div>
            <div className="mt-1 font-sans text-sm text-[#F4F1EA] break-words">{state.summary}</div>
          </div>
        </div>
      </Card>
    );
  }

  if (state.phase === 'declined') {
    return (
      <Card as="section" className="rounded-xl border border-rose-500/30 bg-[#111114] p-4 shadow-sm" aria-label="Mutation declined">
        <div className="flex items-start gap-2.5">
          <IconX className="mt-0.5 size-4.5 shrink-0 text-rose-400" aria-hidden />
          <div className="min-w-0 flex-1 font-mono">
            <div className="text-[11px] font-semibold text-rose-400 uppercase">Directive Cancelled</div>
            <div className="mt-1 font-sans text-sm text-[#F4F1EA]/70">
              The {(KIND_LABELS[payload.mutation] ?? 'mutation').toLowerCase()} was cancelled. Nothing was modified.
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
      className="rounded-xl border border-[#D4AF37]/40 bg-[#111114] p-4 shadow-md transition-all sm:p-5"
      aria-label={`${KIND_LABELS[payload.mutation]} confirmation`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#F4F1EA]/10 pb-3">
        <div className="flex items-center gap-2">
          <IconLock className="size-4 text-[#D4AF37]" />
          <span className="font-mono text-[11px] font-semibold tracking-wider text-[#D4AF37] uppercase">
            HOPLITE EXECUTION GATE // REQUIRES OPERATOR APPROVAL
          </span>
        </div>
        <span className="font-mono text-[10px] text-[#F4F1EA]/50 uppercase">
          {expired ? 'EXPIRED' : `TTL: ~${remainingMin}m`}
        </span>
      </div>

      <div className="mt-3 flex items-start gap-3">
        <div className="rounded-lg border border-[#F4F1EA]/10 bg-[#16161A] p-2 text-[#D4AF37]">
          <KindIcon className="size-5" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-mono text-[11px] font-semibold text-[#F4F1EA]/50 uppercase">
            {KIND_LABELS[payload.mutation]} Mutation Request
          </div>
          <div className="mt-0.5 font-sans text-sm font-medium text-[#F4F1EA] break-words">
            {payload.summary}
          </div>
        </div>
      </div>

      <div className="mt-3 overflow-hidden rounded-lg border border-[#F4F1EA]/10 bg-[#09090B] font-mono text-[11px]">
        <div className="grid grid-cols-3 border-b border-[#F4F1EA]/10 bg-[#16161A] px-3 py-1.5 text-[10px] font-semibold text-[#D4AF37] uppercase">
          <span>Directive</span>
          <span className="col-span-2">Execution Payload</span>
        </div>
        <div className="grid grid-cols-3 px-3 py-2 text-[#F4F1EA]/80">
          <span className="text-[#F4F1EA]/50">Action</span>
          <span className="col-span-2 font-semibold text-[#F4F1EA]">{payload.mutation}</span>
        </div>
        <div className="grid grid-cols-3 border-t border-[#F4F1EA]/5 px-3 py-2 text-[#F4F1EA]/80">
          <span className="text-[#F4F1EA]/50">Run ID</span>
          <span className="col-span-2 truncate">{payload.runId}</span>
        </div>
      </div>

      {state.phase === 'error' && (
        <div role="alert" className="mt-3 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 font-mono text-xs text-rose-400">
          {state.message}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2.5">
        <Button
          size="sm"
          onClick={confirm}
          disabled={state.phase === 'confirming' || expired}
          className="min-h-[44px] min-w-[44px] border border-[#D4AF37] bg-[#D4AF37] font-mono text-xs font-semibold tracking-wider text-[#09090B] hover:bg-[#F4F1EA]"
        >
          {state.phase === 'confirming'
            ? 'Confirming…'
            : (payload.confirmLabel ?? `Confirm ${KIND_LABELS[payload.mutation]}`)}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={decline}
          disabled={state.phase === 'confirming'}
          className="min-h-[44px] min-w-[44px] border border-[#F4F1EA]/10 bg-[#16161A] font-mono text-xs text-[#F4F1EA] hover:border-rose-500/40 hover:text-rose-400"
        >
          {payload.cancelLabel ?? 'Cancel'}
        </Button>
      </div>
    </Card>
  );
}
