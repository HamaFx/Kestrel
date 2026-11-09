// SPDX-License-Identifier: Apache-2.0
// Confirmation card for Mastra mutation drafts. Aegis Human-in-the-Loop Execution Gate.
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
import { IconBell, IconFileText, IconSettings, IconShare } from '@tabler/icons-react';
import { useCallback, useState } from 'react';

import {
  AegisConfirmGate,
  AegisGateConfirmedCard,
  AegisGateDeclinedCard,
} from '@/components/ui/aegis-confirm-gate';
import { useTime } from '@/components/providers/time-provider';
import { apiMutate } from '@/lib/http/api-client';

const KIND_LABELS: Record<MutationDraftPayload['mutation'], string> = {
  set_alert: 'Price Alert',
  log_journal: 'Journal Entry',
  share_snapshot: 'Shared Analysis Link',
  run_system_action: 'System Action',
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

  const { now } = useTime();
  const expired = payload.expiresAt <= now;
  const remainingMin = Math.max(0, Math.ceil((payload.expiresAt - now) / 60_000));
  const kindLabel = KIND_LABELS[payload.mutation] ?? 'Mutation';

  if (state.phase === 'confirmed') {
    return (
      <AegisGateConfirmedCard
        ariaLabel="Mutation confirmed"
        heading={`${kindLabel} Confirmed & Executed`}
        summary={state.summary}
      />
    );
  }

  if (state.phase === 'declined') {
    return (
      <AegisGateDeclinedCard
        ariaLabel="Mutation declined"
        summary={`The ${kindLabel.toLowerCase()} was cancelled. Nothing was modified.`}
      />
    );
  }

  const KindIcon = KIND_ICONS[payload.mutation] ?? IconSettings;

  return (
    <AegisConfirmGate
      ariaLabel={`${kindLabel} confirmation`}
      subtitle={`${kindLabel} Request`}
      title={payload.summary}
      badgeLabel={expired ? 'EXPIRED' : `Expires in ~${remainingMin}m`}
      icon={<KindIcon className="size-5" strokeWidth={1.85} aria-hidden="true" />}
      confirmLabel={payload.confirmLabel ?? `Hold to Confirm ${kindLabel}`}
      cancelLabel={payload.cancelLabel ?? 'Cancel'}
      disabled={expired}
      isConfirming={state.phase === 'confirming'}
      errorMessage={state.phase === 'error' ? state.message : null}
      onConfirm={confirm}
      onCancel={decline}
    >
      <div className="text-fg/80 grid grid-cols-3 px-3 py-2">
        <span className="text-fg-subtle">Action</span>
        <span className="text-fg col-span-2 font-semibold">{kindLabel}</span>
      </div>
    </AegisConfirmGate>
  );
}
