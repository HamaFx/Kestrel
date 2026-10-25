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
import { TwoFactorDoneStage } from './two-factor-done-stage';
import { TwoFactorEnabledStage } from './two-factor-enabled-stage';
import { TwoFactorIdleStage } from './two-factor-idle-stage';
import { TwoFactorQrStage } from './two-factor-qr-stage';
import { useTwoFactor } from './use-two-factor';

interface TwoFactorSetupProps {
  enabled: boolean;
}

export function TwoFactorSetup({ enabled }: TwoFactorSetupProps) {
  const {
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
  } = useTwoFactor();

  if (enabled && step !== 'done') {
    return (
      <TwoFactorEnabledStage
        token={token}
        setToken={setToken}
        disabling={disabling}
        onDisable={handleDisable}
      />
    );
  }

  if (step === 'done') {
    return (
      <TwoFactorDoneStage
        backupCodes={backupCodes}
        onCopyBackupCodes={handleCopyBackupCodes}
        onRegenerateBackupCodes={handleRegenerateBackupCodes}
      />
    );
  }

  if (step === 'show_qr' && qrDataUrl) {
    return (
      <TwoFactorQrStage
        qrDataUrl={qrDataUrl}
        secret={secret}
        backupCodes={backupCodes}
        token={token}
        setToken={setToken}
        verifying={verifying}
        onVerify={handleVerify}
        onCopySecret={handleCopySecret}
        onCopyBackupCodes={handleCopyBackupCodes}
      />
    );
  }

  return (
    <TwoFactorIdleStage
      enabled={enabled}
      isSettingUp={isSettingUp}
      onStartSetup={handleStartSetup}
    />
  );
}
