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
import { IconCheck, IconCopy, IconLoader2, IconShield, IconShieldOff } from '@tabler/icons-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

import {
  disableTwoFactorAction,
  regenerateBackupCodesAction,
  setupTwoFactorAction,
  verifyTwoFactorAction,
} from '../../actions';

interface TwoFactorSetupProps {
  enabled: boolean;
}

export function TwoFactorSetup({ enabled }: TwoFactorSetupProps) {
  const [isSettingUp, setIsSettingUp] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [token, setToken] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [disabling, setDisabling] = useState(false);
  const [step, setStep] = useState<'idle' | 'show_qr' | 'verify' | 'done'>('idle');

  const handleStartSetup = async () => {
    setIsSettingUp(true);
    try {
      const res = await setupTwoFactorAction();
      if (res.ok && res.data) {
        setSecret(res.data.secret);
        setQrDataUrl(res.data.qrDataUrl);
        setBackupCodes(res.data.backupCodes);
        setStep('show_qr');
      } else {
        toast.error(
          'error' in res ? (res.error ?? 'Failed to start setup') : 'Failed to start setup',
        );
      }
    } catch {
      toast.error('Failed to start 2FA setup');
    } finally {
      setIsSettingUp(false);
    }
  };

  const handleVerify = async () => {
    if (!token.trim()) return;
    setVerifying(true);
    try {
      const res = await verifyTwoFactorAction(token.trim());
      if (res.ok) {
        toast.success('Two-factor authentication enabled');
        setStep('done');
      } else {
        toast.error('error' in res ? (res.error ?? 'Invalid code') : 'Invalid code');
      }
    } catch {
      toast.error('Failed to verify code');
    } finally {
      setVerifying(false);
    }
  };

  const handleDisable = async () => {
    if (!token.trim()) return;
    setDisabling(true);
    try {
      const res = await disableTwoFactorAction(token.trim());
      if (res.ok) {
        toast.success('Two-factor authentication disabled');
        setStep('idle');
        setSecret(null);
        setQrDataUrl(null);
        setToken('');
      } else {
        toast.error('error' in res ? (res.error ?? 'Failed to disable') : 'Failed to disable');
      }
    } catch {
      toast.error('Failed to disable 2FA');
    } finally {
      setDisabling(false);
    }
  };

  const handleCopySecret = () => {
    if (secret) {
      navigator.clipboard.writeText(secret);
      toast.success('Secret copied to clipboard');
    }
  };

  const handleCopyBackupCodes = () => {
    if (backupCodes.length > 0) {
      navigator.clipboard.writeText(backupCodes.join('\n'));
      toast.success('Backup codes copied to clipboard');
    }
  };

  const handleRegenerateBackupCodes = async () => {
    const res = await regenerateBackupCodesAction();
    if (res.ok && res.data) {
      setBackupCodes(res.data.backupCodes);
      toast.success('Backup codes regenerated');
    } else {
      toast.error('error' in res ? (res.error ?? 'Failed to regenerate') : 'Failed to regenerate');
    }
  };

  if (enabled && step !== 'done') {
    return (
      <div className="border-border bg-bg-elev-1 flex flex-col gap-4 rounded-sm border p-4">
        <div className="flex items-center gap-2">
          <IconShield className="text-success size-4" />
          <span className="text-fg text-sm font-medium">Two-Factor Authentication</span>
          <span className="bg-success/15 text-success ml-auto rounded-sm px-2 py-0.5 text-xs font-medium">
            Enabled
          </span>
        </div>
        <p className="text-caption text-fg-subtle">
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
            onClick={handleDisable}
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

  if (step === 'done') {
    return (
      <div className="border-border bg-bg-elev-1 flex flex-col gap-3 rounded-sm border p-4">
        <div className="flex items-center gap-2">
          <IconCheck className="text-success size-4" />
          <span className="text-fg text-sm font-medium">Two-Factor Authentication</span>
          <span className="bg-success/15 text-success ml-auto rounded-sm px-2 py-0.5 text-xs font-medium">
            Enabled
          </span>
        </div>
        <p className="text-caption text-fg-subtle">
          2FA is active. Next time you perform a sensitive action (export keys, delete account),
          you'll need your authenticator app code.
        </p>
        {backupCodes.length > 0 && (
          <div className="border-border bg-bg flex w-full flex-col gap-2 rounded-sm border p-3">
            <div className="flex items-center justify-between">
              <span className="text-fg text-sm font-medium">Backup Codes</span>
              <button
                type="button"
                onClick={handleCopyBackupCodes}
                className="text-fg-subtle hover:text-fg cursor-pointer p-1"
                aria-label="Copy all backup codes"
              >
                <IconCopy className="size-3.5" />
              </button>
            </div>
            <p className="text-caption text-fg-subtle">
              Save these single-use codes in a safe place. They are only shown once.
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {backupCodes.map((code) => (
                <code
                  key={code}
                  className="bg-bg-elev-2 border-border rounded-sm border px-2 py-1 text-center font-mono text-xs select-all"
                >
                  {code}
                </code>
              ))}
            </div>
          </div>
        )}
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={handleRegenerateBackupCodes}
          className="w-fit"
        >
          Regenerate backup codes
        </Button>
      </div>
    );
  }

  if (step === 'show_qr' && qrDataUrl) {
    return (
      <div className="border-border bg-bg-elev-1 flex flex-col gap-4 rounded-sm border p-4">
        <div className="flex items-center gap-2">
          <IconShield className="text-fg size-4" />
          <span className="text-fg text-sm font-medium">Set Up Two-Factor Authentication</span>
        </div>{' '}
        <div className="flex flex-col items-center gap-3">
          <img
            src={qrDataUrl}
            alt="Scan this QR code with your authenticator app"
            className="border-border size-40 rounded-sm border"
          />
          <p className="text-caption text-fg-subtle max-w-sm text-center">
            Scan this QR code with your authenticator app (e.g., Google Authenticator, Authy).
          </p>
          <div className="flex items-center gap-2">
            <code className="bg-bg-elev-2 border-border rounded-sm border px-2 py-1 font-mono text-xs select-all">
              {secret}
            </code>
            <button
              type="button"
              onClick={handleCopySecret}
              className="text-fg-subtle hover:text-fg cursor-pointer p-1"
              aria-label="Copy secret"
            >
              <IconCopy className="size-3.5" />
            </button>
          </div>
        </div>
        {backupCodes.length > 0 && (
          <div className="border-border bg-bg-elev-1 flex w-full flex-col gap-2 rounded-sm border p-3">
            <div className="flex items-center justify-between">
              <span className="text-fg text-sm font-medium">Backup Codes</span>
              <button
                type="button"
                onClick={handleCopyBackupCodes}
                className="text-fg-subtle hover:text-fg cursor-pointer p-1"
                aria-label="Copy all backup codes"
              >
                <IconCopy className="size-3.5" />
              </button>
            </div>
            <p className="text-caption text-fg-subtle">
              Save these single-use codes in a safe place. They are only shown once.
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {backupCodes.map((code) => (
                <code
                  key={code}
                  className="bg-bg-elev-2 border-border rounded-sm border px-2 py-1 text-center font-mono text-xs select-all"
                >
                  {code}
                </code>
              ))}
            </div>
          </div>
        )}
        <div className="flex items-center gap-2">
          <Input
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Enter 6-digit code"
            maxLength={6}
            aria-label="Enter verification code"
            className="bg-bg-elev-1 h-9 w-32 text-sm"
          />
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={handleVerify}
            disabled={verifying || token.length !== 6}
          >
            {verifying ? <IconLoader2 className="mr-1 size-3.5 animate-spin" /> : null}
            Verify & Enable
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="border-border bg-bg-elev-1 flex flex-col gap-3 rounded-sm border p-4">
      <div className="flex items-center gap-2">
        <IconShield className="text-fg-muted size-4" />
        <span className="text-fg text-sm font-medium">Two-Factor Authentication</span>
        {enabled && (
          <span className="bg-success/15 text-success ml-auto rounded-sm px-2 py-0.5 text-xs font-medium">
            Enabled
          </span>
        )}
      </div>
      <p className="text-caption text-fg-subtle">
        Add an extra layer of security by requiring a one-time code from your authenticator app when
        performing sensitive actions.
      </p>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={handleStartSetup}
        disabled={isSettingUp}
        className="w-fit"
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
