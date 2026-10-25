'use client';

// SPDX-License-Identifier: Apache-2.0

// 2FA enabled stage: lets an already-enrolled user disable two-factor auth
// by entering a current TOTP code.
import { IconLoader2, IconShield, IconShieldOff } from '@tabler/icons-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function TwoFactorEnabledStage({
  token,
  setToken,
  disabling,
  onDisable,
}: {
  token: string;
  setToken: (value: string) => void;
  disabling: boolean;
  onDisable: () => void;
}) {
  return (
    <div className="surface-panel flex flex-col gap-4 rounded-xl border border-white/10 p-5 shadow-[var(--shadow-chip)]">
      <div className="flex items-center gap-2 border-b border-white/5 pb-1">
        <IconShield className="text-success size-4" />
        <h3 className="text-fg text-base font-semibold tracking-tight">
          Two-Factor Authentication
        </h3>
        <span className="surface-chip bg-success/15 text-success ml-auto rounded-md px-2 py-0.5 font-mono text-[11px] font-medium">
          Enabled
        </span>
      </div>
      <p className="text-fg-subtle text-xs">
        Your account is protected with TOTP-based two-factor authentication.
      </p>
      <div className="flex flex-col gap-2">
        <Input
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="Enter 6-digit code to disable"
          maxLength={6}
          aria-label="Enter 6-digit code to disable two-factor authentication"
          className="bg-bg-elev-1 h-9 w-40 text-sm"
        />
        <Button
          type="button"
          variant="danger"
          size="sm"
          onClick={onDisable}
          disabled={disabling || token.length !== 6}
          className="w-fit"
        >
          {disabling ? (
            <IconLoader2 className="mr-1 size-3.5 animate-spin" />
          ) : (
            <IconShieldOff className="mr-1 size-3.5" />
          )}
          Disable 2FA
        </Button>
      </div>
    </div>
  );
}
