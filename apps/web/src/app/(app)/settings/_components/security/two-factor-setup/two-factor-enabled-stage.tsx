'use client';

// SPDX-License-Identifier: Apache-2.0

// 2FA enabled stage: lets an already-enrolled user disable two-factor auth
// by entering a current TOTP code or regenerate single-use backup codes.
import { IconLoader2, IconRefresh, IconShield, IconShieldOff } from '@tabler/icons-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

import { BackupCodesPanel } from './backup-codes-panel';

export function TwoFactorEnabledStage({
  token,
  setToken,
  disabling,
  onDisable,
  backupCodes = [],
  onCopyBackupCodes,
  onRegenerateBackupCodes,
}: {
  token: string;
  setToken: (value: string) => void;
  disabling: boolean;
  onDisable: () => void;
  backupCodes?: string[];
  onCopyBackupCodes?: () => void;
  onRegenerateBackupCodes?: () => void;
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
      {backupCodes.length > 0 && onCopyBackupCodes ? (
        <BackupCodesPanel
          codes={backupCodes}
          onCopy={onCopyBackupCodes}
          copyButtonClassName="surface-chip text-fg-subtle hover:text-fg inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-white/10 px-2.5 text-xs font-medium transition-colors"
        />
      ) : null}
      <div className="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-center">
        <Input
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="6-digit code"
          maxLength={6}
          inputMode="numeric"
          aria-label="Enter 6-digit code to disable two-factor authentication"
          className="bg-bg-elev-1 h-11 w-full text-sm sm:w-64"
        />
        <Button
          type="button"
          variant="danger"
          size="md"
          onClick={onDisable}
          disabled={disabling || token.length !== 6}
          className="h-11 w-fit"
        >
          {disabling ? (
            <IconLoader2 className="mr-1 size-3.5 animate-spin" />
          ) : (
            <IconShieldOff className="mr-1 size-3.5" />
          )}
          Disable 2FA
        </Button>
        {onRegenerateBackupCodes ? (
          <Button
            type="button"
            variant="secondary"
            size="md"
            onClick={onRegenerateBackupCodes}
            className="tactile-press h-11 w-fit active:translate-y-[0.5px]"
          >
            <IconRefresh className="mr-1 size-3.5" />
            Regenerate backup codes
          </Button>
        ) : null}
      </div>
    </div>
  );
}
