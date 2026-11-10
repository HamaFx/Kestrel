'use client';

// SPDX-License-Identifier: Apache-2.0

// 2FA QR stage: shows the enrolment QR code + secret and verifies the first
// authenticator code to enable two-factor auth.
import { IconCopy, IconShield } from '@tabler/icons-react';

import { Button } from '@/components/ui/button';
import { OtpInput } from '@/components/ui/otp-input';

import { BackupCodesPanel } from './backup-codes-panel';

export function TwoFactorQrStage({
  qrDataUrl,
  secret,
  backupCodes,
  token,
  setToken,
  verifying,
  onVerify,
  onCopySecret,
  onCopyBackupCodes,
}: {
  qrDataUrl: string;
  secret: string | null;
  backupCodes: string[];
  token: string;
  setToken: (value: string) => void;
  verifying: boolean;
  onVerify: () => void;
  onCopySecret: () => void;
  onCopyBackupCodes: () => void;
}) {
  return (
    <div className="surface-panel flex flex-col gap-4 rounded-xl border border-white/10 p-5 shadow-[var(--shadow-chip)]">
      <div className="flex items-center gap-2 border-b border-white/5 pb-1">
        <IconShield className="text-fg size-4" />
        <h3 className="text-fg text-base font-semibold tracking-tight">
          Set Up Two-Factor Authentication
        </h3>
      </div>
      <div className="flex flex-col items-center gap-3">
        <img
          src={qrDataUrl}
          alt="Scan this QR code with your authenticator app"
          className="surface-well size-40 rounded-xl border border-white/10 p-2"
        />
        <p className="text-caption text-fg-subtle max-w-sm text-center">
          Scan this QR code with your authenticator app (e.g., Google Authenticator, Authy).
        </p>
        <div className="flex items-center gap-2">
          <code className="surface-chip rounded-lg border border-white/5 px-2.5 py-1 font-mono text-xs select-all">
            {secret}
          </code>
          <button
            type="button"
            onClick={onCopySecret}
            className="surface-chip text-fg-subtle hover:text-fg inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-white/10 px-2.5 text-xs font-medium transition-colors"
            aria-label="Copy secret"
          >
            <IconCopy className="size-3.5" />
            <span>Copy</span>
          </button>
        </div>
      </div>
      {backupCodes.length > 0 && (
        <BackupCodesPanel
          codes={backupCodes}
          onCopy={onCopyBackupCodes}
          copyButtonClassName="surface-chip text-fg-subtle hover:text-fg inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-white/10 px-2.5 text-xs font-medium transition-colors"
        />
      )}
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
        <OtpInput value={token} onValueChange={setToken} aria-label="Enter verification code" />
        <Button
          type="button"
          variant="primary"
          size="md"
          loading={verifying}
          onClick={onVerify}
          disabled={verifying || token.length !== 6}
          className="tactile-press h-11 active:translate-y-[0.5px]"
        >
          Verify & Enable
        </Button>
      </div>
    </div>
  );
}
