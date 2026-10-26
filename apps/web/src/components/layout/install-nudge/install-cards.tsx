'use client';

// SPDX-License-Identifier: Apache-2.0

// Install affordance cards: a one-tap Chromium install prompt, per-platform
// "Add to Home Screen" steps, and a compact success state. All three share the
// same shell so the nudge never changes height class-by-class.
import { IconDownload, IconX } from '@tabler/icons-react';
import type { ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/formatters/cn';

import type { InstallInstructions } from './platform-instructions';

function NudgeShell({
  children,
  onDismiss,
  dismissLabel,
  variant = 'nudge',
}: {
  children: ReactNode;
  onDismiss?: () => void;
  dismissLabel?: string;
  variant?: 'nudge' | 'plain';
}) {
  return (
    <section
      aria-label="Install Kestrel"
      className={cn(
        'border-border flex items-start gap-3 rounded-sm border',
        variant === 'nudge' ? 'bg-bg-elev-2 mx-3 mt-2 p-3' : 'bg-bg-elev-1 p-4',
      )}
    >
      <div className="flex-1">{children}</div>
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          aria-label={dismissLabel ?? 'Dismiss install instructions'}
          className="text-fg-subtle hover:text-fg hover:bg-bg-elev-3 focus-visible:ring-fg -mr-1 inline-flex size-11 shrink-0 items-center justify-center rounded-sm transition-colors focus-visible:ring-2 focus-visible:outline-none"
        >
          <IconX className="size-4" aria-hidden="true" />
        </button>
      ) : null}
    </section>
  );
}

/** What the user gains — shown before any install UI. */
const BENEFITS = 'Full screen, one tap from your home screen, alerts on this device.';

/** Chromium: a native install prompt is already waiting for us. */
export function InstallPromptCard({
  onInstall,
  onDismiss,
}: {
  onInstall: () => void;
  onDismiss: () => void;
}) {
  return (
    <NudgeShell onDismiss={onDismiss} dismissLabel="Dismiss install prompt">
      <p className="text-fg text-body-sm font-semibold">Install Kestrel</p>
      <p className="text-fg-muted text-caption mt-1 leading-snug">{BENEFITS}</p>
      <div className="mt-2.5 flex items-center gap-2">
        <Button size="sm" onClick={onInstall} className="min-h-[44px] gap-2">
          <IconDownload className="size-4" aria-hidden="true" />
          Install
        </Button>
        <Button size="sm" variant="ghost" onClick={onDismiss} className="min-h-[44px]">
          Not now
        </Button>
      </div>
    </NudgeShell>
  );
}

/** iOS / macOS Safari / any platform with a manual "add to home screen" path. */
export function InstallInstructionsCard({
  instructions,
  onDismiss,
  variant = 'nudge',
}: {
  instructions: InstallInstructions;
  /** Omit to render without the dismiss affordance (settings surface). */
  onDismiss?: () => void;
  variant?: 'nudge' | 'plain';
}) {
  return (
    <NudgeShell onDismiss={onDismiss} dismissLabel="Dismiss install instructions" variant={variant}>
      <p className="text-fg text-body-sm font-semibold">{instructions.title}</p>
      <p className="text-fg-muted text-caption mt-1 leading-snug">{instructions.summary}</p>
      <ol className="mt-2.5 flex flex-col gap-1.5">
        {instructions.steps.map((step, index) => {
          const Icon = step.icon;
          return (
            <li key={step.label} className="text-caption flex items-center gap-2">
              <span
                aria-hidden="true"
                className="border-border text-fg-subtle flex size-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-semibold"
              >
                {index + 1}
              </span>
              <Icon className="text-fg-muted size-4 shrink-0" aria-hidden="true" />
              <span className="leading-snug">
                <span className="text-fg font-medium">{step.label}</span>
                {step.detail ? <span className="text-fg-subtle"> · {step.detail}</span> : null}
              </span>
            </li>
          );
        })}
      </ol>
      {instructions.note ? (
        <p className="text-fg-subtle text-caption mt-2 leading-snug">{instructions.note}</p>
      ) : null}
    </NudgeShell>
  );
}
