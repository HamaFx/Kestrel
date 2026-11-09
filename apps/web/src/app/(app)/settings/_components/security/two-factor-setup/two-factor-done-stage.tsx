'use client';

// SPDX-License-Identifier: Apache-2.0

// 2FA done stage: confirms the enabled state and lets the user regenerate
// their single-use backup codes.
import { IconCheck } from '@tabler/icons-react';

import { Button } from '@/components/ui/button';

import { BackupCodesPanel } from './backup-codes-panel';

export function TwoFactorDoneStage({
  backupCodes,
  onCopyBackupCodes,
  onRegenerateBackupCodes,
}: {
  backupCodes: string[];
  onCopyBackupCodes: () => void;
  onRegenerateBackupCodes: () => void;
}) {
  return (
    <div className="surface-panel flex flex-col gap-3 rounded-xl border border-white/10 p-5 shadow-[var(--shadow-chip)]">
      <div className="flex items-center gap-2 border-b border-white/5 pb-1">
        <IconCheck className="text-success size-4" />
        <h3 className="text-fg text-base font-semibold tracking-tight">
          Two-Factor Authentication
        </h3>
        <span className="surface-chip bg-success/15 text-success ml-auto rounded-md px-2 py-0.5 font-mono text-[11px] font-medium">
          Enabled
        </span>
      </div>
      <p className="text-fg-subtle text-xs">
        2FA is active. Next time you perform a sensitive action (export keys, delete account),
        you'll need your authenticator app code.
      </p>
      {backupCodes.length > 0 && (
        <BackupCodesPanel
          codes={backupCodes}
          onCopy={onCopyBackupCodes}
          copyButtonClassName="surface-chip text-fg-subtle hover:text-fg inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-white/10 px-2.5 text-xs font-medium transition-colors"
        />
      )}
      <Button
        type="button"
        variant="secondary"
        size="md"
        onClick={onRegenerateBackupCodes}
        className="tactile-press h-11 w-fit active:translate-y-[0.5px]"
      >
        Regenerate backup codes
      </Button>
    </div>
  );
}
