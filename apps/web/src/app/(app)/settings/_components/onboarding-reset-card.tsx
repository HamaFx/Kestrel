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
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-drawer';
import { Switch } from '@/components/ui/switch';

import { resetOnboardingAction } from '../actions';

export function OnboardingResetCard() {
  const router = useRouter();
  const [resetting, setResetting] = useState(false);
  const [fullReset, setFullReset] = useState(false);
  const [confirmEl, confirm] = useConfirm();

  async function handleReset() {
    const ok = await confirm({
      title: 'Reset onboarding?',
      description: 'You will need to go through the wizard again.',
      confirmLabel: 'Reset',
      tone: 'danger',
    });
    if (!ok) return;
    setResetting(true);
    try {
      const res = await resetOnboardingAction({ soft: !fullReset });
      if (!res.ok) {
        throw new Error(res.error ?? 'Failed to reset onboarding');
      }
      toast.success('Onboarding reset. Redirecting...');
      router.push('/onboarding');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to reset onboarding');
    } finally {
      setResetting(false);
    }
  }

  return (
    <div className="surface-panel flex flex-col gap-4 rounded-xl border border-white/10 p-5 shadow-[var(--shadow-chip)]">
      <div className="flex items-center justify-between border-b border-white/5 pb-3">
        <div>
          <h3 className="text-fg text-sm font-semibold tracking-tight">Onboarding Setup Wizard</h3>
          <p className="text-fg-subtle text-xs">Reset and replay the initial workspace setup walkthrough.</p>
        </div>
        <span className="surface-chip text-fg-subtle rounded-md px-2 py-0.5 font-mono text-[11px] font-medium uppercase">
          Setup
        </span>
      </div>

      <div className="surface-well flex items-center justify-between rounded-xl border border-white/5 p-3.5 shadow-inner">
        <div className="flex flex-col">
          <span className="text-fg text-sm font-medium">Full Factory Reset</span>
          <span className="text-fg-subtle text-xs">Also purges saved BYOK provider keys and custom watchlist</span>
        </div>
        <Switch checked={fullReset} onCheckedChange={setFullReset} srLabel="Full reset mode" />
      </div>

      <Button variant="danger" loading={resetting} onClick={handleReset} className="tactile-press rounded-lg">
        Reset Onboarding
      </Button>
      {confirmEl}
    </div>
  );
}

