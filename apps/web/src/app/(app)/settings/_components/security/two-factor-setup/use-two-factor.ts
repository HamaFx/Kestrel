// SPDX-License-Identifier: Apache-2.0

// Two-factor auth state for the settings flow: setup, verify, disable, and
// backup-code copy/regenerate handlers shared by every stage.

import { useState } from 'react';
import { toast } from 'sonner';

import {
  disableTwoFactorAction,
  regenerateBackupCodesAction,
  setupTwoFactorAction,
  verifyTwoFactorAction,
} from '@/app/(app)/settings/actions';

export type TwoFactorStep = 'idle' | 'show_qr' | 'verify' | 'done';

export function useTwoFactor() {
  const [isSettingUp, setIsSettingUp] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [token, setToken] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [disabling, setDisabling] = useState(false);
  const [step, setStep] = useState<TwoFactorStep>('idle');

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

  return {
    step,
    secret,
    qrDataUrl,
    backupCodes,
    token,
    setToken,
    isSettingUp,
    verifying,
    disabling,
    handleStartSetup,
    handleVerify,
    handleDisable,
    handleCopySecret,
    handleCopyBackupCodes,
    handleRegenerateBackupCodes,
  };
}
