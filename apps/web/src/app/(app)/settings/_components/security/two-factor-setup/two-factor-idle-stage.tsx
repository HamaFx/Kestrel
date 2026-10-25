'use client';

// SPDX-License-Identifier: Apache-2.0

// 2FA idle stage: entry point that starts the TOTP setup flow.
import { IconLoader2, IconShield } from '@tabler/icons-react';

import { Button } from '@/components/ui/button';

export function TwoFactorIdleStage({
  enabled,
  isSettingUp,
  onStartSetup,
}: {
  enabled: boolean;
  isSettingUp: boolean;
  onStartSetup: () => void;
}) {
  return (
    <div className="surface-panel flex flex-col gap-3 rounded-xl border border-white/10 p-5 shadow-[var(--shadow-chip)]">
      <div className="flex items-center gap-2 border-b border-white/5 pb-1">
        <IconShield className="text-fg-muted size-4" />
        <h3 className="text-fg text-base font-semibold tracking-tight">
          Two-Factor Authentication
        </h3>
        {enabled && (
          <span className="surface-chip bg-success/15 text-success ml-auto rounded-md px-2 py-0.5 font-mono text-[11px] font-medium">
            Enabled
          </span>
        )}
      </div>
      <p className="text-fg-subtle text-xs">
        Add an extra layer of security by requiring a one-time code from your authenticator app when
        performing sensitive actions.
      </p>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={onStartSetup}
        disabled={isSettingUp}
        className="tactile-press w-fit active:translate-y-[0.5px]"
      >
        {isSettingUp ? (
          <IconLoader2 className="mr-1 size-3.5 animate-spin" />
        ) : (
          <IconShield className="mr-1 size-3.5" />
        )}
        Set up 2FA
      </Button>
    </div>
  );
}
