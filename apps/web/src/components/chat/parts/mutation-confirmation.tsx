// SPDX-License-Identifier: Apache-2.0

// Confirmation card for Mastra mutation drafts (Phase 7).
//
// The chat route returns a `mutation-draft` event carrying the suspend
// payload (single-use token + summary). This card renders that payload and,
// on Confirm, posts the token to /api/chat/mutations/confirm which resumes
// the suspended workflow — re-validating the token (timing-safe digest +
// expiry) and the server-side mutation policy BEFORE the audited write
// executes. Nothing is written until this card's Confirm succeeds.

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
  IconClock,
  IconFileText,
  IconSettings,
  IconShare,
  IconX,
} from '@tabler/icons-react';
import { useCallback, useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { apiMutate } from '@/lib/api-client';
import { cn } from '@/lib/cn';

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

interface MutationConfirmationCardProps {
  payload: MutationDraftPayload;
}

export function MutationConfirmationCard({ payload }: MutationConfirmationCardProps) {
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
      if (!parsed.success) {
        throw new Error('Confirmation returned an unexpected response.');
      }
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

  // When the token has expired, stop offering Confirm.
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
      <Card as="section" className="border-border bg-bg-elev-1 p-3" aria-label="Mutation confirmed">
        <div className="flex items-start gap-2">
          <IconCheck className="text-bull size-4.5 mt-0.5 shrink-0" aria-hidden />
          <div className="min-w-0 flex-1">
            <div className="text-fg-muted text-xs">{KIND_LABELS[payload.mutation]} confirmed</div>
            <div className="text-fg mt-0.5 text-sm font-medium break-words">{state.summary}</div>
          </div>
        </div>
      </Card>
    );
  }

  if (state.phase === 'declined') {
    return (
      <Card as="section" className="border-border bg-bg-elev-1 p-3" aria-label="Mutation declined">
        <div className="flex items-start gap-2">
          <IconX className="text-danger size-4.5 mt-0.5 shrink-0" aria-hidden />
          <div className="min-w-0 flex-1">
            <div className="text-fg-muted text-xs">Not executed</div>
            <div className="text-fg mt-0.5 text-sm">
              The {(KIND_LABELS[payload.mutation] ?? 'mutation').toLowerCase()} was cancelled.
              Nothing was changed.
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
      className="border-border bg-bg-elev-1 p-3"
      aria-label={`${KIND_LABELS[payload.mutation]} confirmation`}
    >
      <div className="flex items-start gap-2">
        <KindIcon className="text-brand size-4.5 mt-0.5 shrink-0" aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="text-fg-muted text-xs">Confirmation required</div>
          <div className="text-fg mt-0.5 text-sm font-medium break-words">{payload.summary}</div>
          <div className="text-fg-muted mt-1 text-xs">
            {expired
              ? 'This confirmation has expired. Retry the request to get a fresh one.'
              : `Expires in ~${remainingMin} min · nothing is written until you confirm`}
          </div>
        </div>
      </div>

      {state.phase === 'error' && (
        <div
          role="alert"
          className="border-danger/30 bg-danger/10 text-danger mt-2 rounded-sm border px-2 py-1.5 text-xs"
        >
          {state.message}
        </div>
      )}

      <div className="mt-3 flex items-center gap-2">
        <Button
          size="sm"
          onClick={confirm}
          disabled={state.phase === 'confirming' || expired}
          className={cn('min-h-[44px] min-w-[44px]')}
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
          className={cn('min-h-[44px] min-w-[44px]')}
        >
          {payload.cancelLabel ?? 'Cancel'}
        </Button>
      </div>
    </Card>
  );
}
