'use client';

// SPDX-License-Identifier: Apache-2.0

// Dispatch stage cards for the landing simulator: the journal/alert logging
// terminal output and the confirmation card.
import { IconCheck, IconCopy, IconTerminal2 } from '@tabler/icons-react';
import { m } from 'motion/react';

import { Button } from '@/components/ui/button';

import type { Scenario } from './scenarios';

interface DispatchCardProps {
  scenario: Scenario;
}

export function DispatchingCard({ scenario }: DispatchCardProps) {
  return (
    <m.div
      key="dispatching-card"
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      className="border-brand/40 rounded-xl border bg-black/80 p-6 shadow-2xl"
    >
      <div className="text-brand mb-4 flex items-center gap-3 font-mono text-xs">
        <IconTerminal2 className="size-4 animate-spin" />
        <span>LOGGING SETUP TO TRADE JOURNAL & ARMING PRICE ALERTS...</span>
      </div>
      <div className="surface-well text-bull/90 overflow-x-auto rounded-lg border border-white/10 bg-[#08090a] p-4 font-mono text-[11px]">
        <code>{scenario.journalSummary}</code>
      </div>
      <div className="text-fg-subtle mt-3 flex items-center justify-between font-mono text-[11px]">
        <span>CHANNELS: TELEGRAM · BROWSER PUSH · EMAIL</span>
        <span>R-MULTIPLE TRACKING ENABLED</span>
      </div>
    </m.div>
  );
}

interface DispatchedCardProps {
  scenario: Scenario;
  copiedHash: boolean;
  onCopyHash: (text: string) => void;
  onReset: () => void;
}

export function DispatchedCard({ scenario, copiedHash, onCopyHash, onReset }: DispatchedCardProps) {
  return (
    <m.div
      key="dispatched-card"
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      className="border-bull/40 bg-bull/[0.05] rounded-xl border p-6 text-center shadow-xl"
    >
      <div className="bg-bull/20 border-bull/40 text-bull mx-auto mb-3 flex size-12 items-center justify-center rounded-full border shadow-[0_0_16px_rgba(63,158,61,0.25)]">
        <IconCheck className="size-6" />
      </div>
      <h4 className="font-display text-fg text-xl font-normal tracking-tight">
        SETUP LOGGED TO JOURNAL & PRICE ALERTS ARMED
      </h4>
      <p className="text-fg-muted mx-auto mt-2 max-w-lg font-mono text-xs leading-relaxed">
        Plan {scenario.txHash} has been saved to your Trade Journal with R-multiple targets and
        instant Telegram, Browser Push, and Email alerts armed at Entry ({scenario.entry}),
        Invalidation ({scenario.invalidation}), and TP1 ({scenario.target1}).
      </p>

      <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onCopyHash(scenario.journalSummary)}
          className="gap-1.5 border-white/10 font-mono text-xs"
        >
          {copiedHash ? (
            <IconCheck className="text-bull size-3.5" />
          ) : (
            <IconCopy className="size-3.5" />
          )}
          <span>{copiedHash ? 'Setup Copied!' : 'Copy Trade Plan Summary'}</span>
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={onReset}
          className="border-white/10 font-mono text-xs"
        >
          Simulate Another Scenario
        </Button>
      </div>
    </m.div>
  );
}
