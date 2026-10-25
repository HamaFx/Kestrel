// SPDX-License-Identifier: Apache-2.0

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
import { SettingsSection } from '@/app/(app)/settings/_components/settings-section';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

import { OnboardingStatusCard } from './onboarding-status-card';
import { useOnboardingControl } from './use-onboarding-control';

export function AdminOnboardingControl() {
  const {
    targetUserId,
    setTargetUserId,
    status,
    loading,
    resetting,
    fullReset,
    setFullReset,
    confirmEl,
    handleLoadUser,
    handleReset,
  } = useOnboardingControl();

  return (
    <div className="flex flex-col gap-6">
      <SettingsSection
        title="Onboarding Inspector"
        description="Inspect and reset onboarding for any user."
      >
        <form onSubmit={handleLoadUser} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex flex-1 flex-col gap-1">
            <label htmlFor="target-user-id" className="text-sm font-medium">
              Target user ID
            </label>
            <Input
              id="target-user-id"
              type="text"
              placeholder="Leave blank for your own account"
              value={targetUserId}
              onChange={(e) => setTargetUserId(e.target.value)}
            />
          </div>
          <Button type="submit" variant="secondary" loading={loading}>
            Load user
          </Button>
        </form>

        {status && (
          <OnboardingStatusCard
            status={status}
            fullReset={fullReset}
            resetting={resetting}
            onFullResetChange={setFullReset}
            onReset={() => void handleReset()}
          />
        )}
      </SettingsSection>
      {confirmEl}
    </div>
  );
}
