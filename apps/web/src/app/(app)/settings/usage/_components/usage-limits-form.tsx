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
import { IconAlertTriangle, IconBrandTelegram, IconMail } from '@tabler/icons-react';
import { useActionState, useEffect } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

import { updateUsageSettingsAction } from '../../actions';

interface ProviderSpendItem {
  id: string;
  displayName: string;
  currentSpend: number;
  threshold: number | null;
}

interface UsageLimitsFormProps {
  initialMonthlyLimit: number | null;
  initialAlertConfig: { email?: boolean; telegram?: boolean };
  providers: ProviderSpendItem[];
}

export function UsageLimitsForm({
  initialMonthlyLimit,
  initialAlertConfig,
  providers,
}: UsageLimitsFormProps) {
  const [state, action, pending] = useActionState(
    async (prevState: { error: string; ok: boolean }, formData: FormData) => {
      const res = await updateUsageSettingsAction(formData);
      return {
        error: 'error' in res ? (res.error ?? '') : '',
        ok: res.ok,
      };
    },
    { error: '', ok: false },
  );

  useEffect(() => {
    if (state.ok) {
      toast.success('Usage limits and alerts updated successfully');
    } else if (state.error) {
      toast.error(state.error);
    }
  }, [state.ok, state.error]);

  return (
    <form
      action={action}
      className="border-border bg-bg-elev-1 flex flex-col gap-6 rounded-sm border p-5"
    >
      <header className="border-border flex items-center gap-3 border-b pb-3">
        <IconAlertTriangle className="text-fg size-5 shrink-0" />
        <div>
          <h2 className="text-fg text-sm font-semibold">Limits & Alerts</h2>
          <p className="text-caption text-fg-subtle mt-0.5">
            Configure monthly spend caps, set thresholds per provider, and select alert channels.
          </p>
        </div>
      </header>

      {/* Monthly Budget Limit */}
      <div className="flex flex-col gap-2">
        <label
          htmlFor="monthlyBudgetLimit"
          className="text-fg-muted text-xs font-semibold tracking-wider uppercase"
        >
          Monthly Budget Limit (USD)
        </label>
        <Input
          id="monthlyBudgetLimit"
          name="monthlyBudgetLimit"
          type="number"
          min="0"
          placeholder="No monthly limit"
          defaultValue={initialMonthlyLimit ?? ''}
          className="max-w-[200px]"
        />
        <p className="text-caption text-fg-subtle">
          Total AI spent cap for the current calendar month. Chat will be blocked once reached.
        </p>
      </div>

      {/* Alert Channels */}
      <div className="flex flex-col gap-3">
        <span className="text-fg-muted text-xs font-semibold tracking-wider uppercase">
          Alert Channels (50%, 80%, 100% thresholds)
        </span>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="border-border bg-bg-elev-2/40 hover:bg-bg-elev-2 flex cursor-pointer items-center gap-3 rounded-sm border p-3 transition-colors select-none">
            <input
              type="checkbox"
              name="emailAlert"
              defaultChecked={!!initialAlertConfig.email}
              className="accent-brand border-border size-4 cursor-pointer rounded-sm"
            />
            <div className="flex items-center gap-2">
              <IconMail className="text-fg-subtle size-4" />
              <div className="flex flex-col">
                <span className="text-fg text-xs font-semibold">Email Alerts</span>
                <span className="text-fg-subtle mt-0.5 text-xs">Alerts via Resend</span>
              </div>
            </div>
          </label>

          <label className="border-border bg-bg-elev-2/40 hover:bg-bg-elev-2 flex cursor-pointer items-center gap-3 rounded-sm border p-3 transition-colors select-none">
            <input
              type="checkbox"
              name="telegramAlert"
              defaultChecked={!!initialAlertConfig.telegram}
              className="accent-brand border-border size-4 cursor-pointer rounded-sm"
            />
            <div className="flex items-center gap-2">
              <IconBrandTelegram className="text-fg-subtle size-4" />
              <div className="flex flex-col">
                <span className="text-fg text-xs font-semibold">Telegram Alerts</span>
                <span className="text-fg-subtle mt-0.5 text-xs">Alerts via Telegram bot</span>
              </div>
            </div>
          </label>
        </div>
      </div>

      {/* Per-Provider Spending Thresholds */}
      <div className="flex flex-col gap-3">
        <span className="text-fg-muted text-xs font-semibold tracking-wider uppercase">
          Per-Provider Monthly Spending Thresholds
        </span>
        <div className="border-border divide-border/60 flex flex-col divide-y overflow-hidden rounded-sm border">
          <div className="bg-bg-elev-2 text-fg-muted grid grid-cols-[1.5fr_1fr_1.2fr] items-center gap-2 px-3 py-2 text-xs font-bold tracking-wider uppercase">
            <span>Provider</span>
            <span className="text-right">Spend (MTD)</span>
            <span className="text-right">Threshold (USD)</span>
          </div>

          {providers.map((p) => {
            const hasExceeded = p.threshold ? p.currentSpend >= p.threshold : false;

            return (
              <div
                key={p.id}
                className="hover:bg-bg-elev-2/20 grid grid-cols-[1.5fr_1fr_1.2fr] items-center gap-2 px-3 py-2.5 text-xs transition-colors"
              >
                <div className="flex flex-col">
                  <span className="text-fg font-semibold">{p.displayName}</span>
                  <span className="text-fg-subtle mt-0.5 font-mono text-xs">{p.id}</span>
                </div>
                <div className="text-fg-subtle text-right font-mono tabular-nums">
                  <span className={hasExceeded ? 'text-danger font-semibold' : ''}>
                    ${p.currentSpend.toFixed(2)}
                  </span>
                </div>
                <div className="flex items-center justify-end">
                  <div className="relative w-full max-w-[100px]">
                    <span className="text-fg-subtle absolute top-1/2 left-2.5 -translate-y-1/2">
                      $
                    </span>
                    <Input
                      name={`threshold-${p.id}`}
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="None"
                      defaultValue={p.threshold ?? ''}
                      aria-label={`Spending threshold for ${p.displayName}`}
                      className="h-8 pr-2 pl-6 text-right font-mono text-xs"
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="border-border flex justify-end border-t pt-4">
        <Button type="submit" loading={pending} className="min-w-[120px]">
          Save Changes
        </Button>
      </div>
    </form>
  );
}
