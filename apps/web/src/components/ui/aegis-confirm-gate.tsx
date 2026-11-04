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

// SPDX-License-Identifier: Apache-2.0

// Unified Aegis Human-in-the-Loop Execution Gate used across Mastra mutation
// drafts and plugin write-tool confirmations. Enforces tactile press-and-hold
// execution safety (`HoldToExecuteButton`) and recessed `surface-well` payload
// inspection.
import { IconCheck, IconLock, IconShieldLock, IconX } from '@tabler/icons-react';
import type { ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { HoldToExecuteButton } from '@/components/ui/hold-to-execute-button';
import { IconBadge } from '@/components/ui/icon-badge';

export interface AegisConfirmGateProps {
  ariaLabel: string;
  subtitle: string;
  title: string;
  badgeLabel?: string;
  icon?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  disabled?: boolean;
  isConfirming?: boolean;
  errorMessage?: string | null;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
  children: ReactNode;
}

export function AegisConfirmGate({
  ariaLabel,
  subtitle,
  title,
  badgeLabel,
  icon,
  confirmLabel,
  cancelLabel = 'Cancel',
  disabled = false,
  isConfirming = false,
  errorMessage,
  onConfirm,
  onCancel,
  children,
}: AegisConfirmGateProps) {
  return (
    <Card
      as="section"
      className="bg-bg-elev-1 border-brand/40 rounded-xl border p-4 shadow-md transition-all sm:p-5"
      aria-label={ariaLabel}
    >
      <div className="border-border/40 flex flex-wrap items-center justify-between gap-2 border-b pb-3">
        <div className="flex items-center gap-2">
          <IconLock className="text-brand size-4" strokeWidth={1.85} aria-hidden="true" />
          <span className="text-brand font-mono text-[11px] font-semibold tracking-wider uppercase">
            AEGIS EXECUTION GATE // REQUIRES OPERATOR APPROVAL
          </span>
        </div>
        {badgeLabel ? (
          <span className="text-fg-subtle font-mono text-[11px] uppercase tabular-nums">
            {badgeLabel}
          </span>
        ) : null}
      </div>

      <div className="mt-3 flex items-start gap-3">
        <IconBadge tone="brand" size="md" reticle>
          {icon ?? <IconShieldLock className="size-5" strokeWidth={1.85} aria-hidden="true" />}
        </IconBadge>
        <div className="min-w-0 flex-1">
          <div className="text-fg-subtle font-mono text-[11px] font-semibold uppercase">
            {subtitle}
          </div>
          <div className="text-fg mt-0.5 font-sans text-sm font-medium break-words">{title}</div>
        </div>
      </div>

      <div className="surface-well mt-3 overflow-hidden rounded-lg font-mono text-[11px]">
        {children}
      </div>

      {errorMessage ? (
        <div
          role="alert"
          className="border-danger/30 bg-danger/10 text-danger mt-3 rounded-md border px-3 py-2 font-mono text-xs"
        >
          {errorMessage}
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-2.5">
        <HoldToExecuteButton
          size="sm"
          onExecute={onConfirm}
          disabled={disabled || isConfirming}
          label={confirmLabel}
          executingLabel="Confirming…"
          completedLabel="Confirmed"
          variant="brand"
        />
        <Button
          size="sm"
          variant="secondary"
          onClick={onCancel}
          disabled={isConfirming}
          className="hover:border-danger/40 hover:text-danger min-h-[44px] min-w-[44px] font-mono text-xs"
        >
          {cancelLabel}
        </Button>
      </div>
    </Card>
  );
}

export function AegisGateConfirmedCard({
  ariaLabel = 'Execution confirmed',
  heading,
  summary,
}: {
  ariaLabel?: string;
  heading: string;
  summary: string;
}) {
  return (
    <Card
      as="section"
      className="border-bull/30 bg-bg-elev-1 rounded-xl border p-4 shadow-sm"
      aria-label={ariaLabel}
    >
      <div className="flex items-start gap-2.5">
        <IconCheck className="text-bull mt-0.5 size-4.5 shrink-0" aria-hidden="true" />
        <div className="min-w-0 flex-1 font-mono">
          <div className="text-bull text-[11px] font-semibold uppercase">{heading}</div>
          <div className="text-fg mt-1 font-sans text-sm break-words">{summary}</div>
        </div>
      </div>
    </Card>
  );
}

export function AegisGateDeclinedCard({
  ariaLabel = 'Directive declined',
  heading = 'Directive Cancelled',
  summary,
}: {
  ariaLabel?: string;
  heading?: string;
  summary: string;
}) {
  return (
    <Card
      as="section"
      className="border-danger/30 bg-bg-elev-1 rounded-xl border p-4 shadow-sm"
      aria-label={ariaLabel}
    >
      <div className="flex items-start gap-2.5">
        <IconX className="text-danger mt-0.5 size-4.5 shrink-0" aria-hidden="true" />
        <div className="min-w-0 flex-1 font-mono">
          <div className="text-danger text-[11px] font-semibold uppercase">{heading}</div>
          <div className="text-fg-muted mt-1 font-sans text-sm">{summary}</div>
        </div>
      </div>
    </Card>
  );
}
