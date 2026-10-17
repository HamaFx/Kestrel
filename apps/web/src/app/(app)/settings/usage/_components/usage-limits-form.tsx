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
      className="surface-panel flex flex-col gap-6 rounded-xl border border-white/10 p-5 shadow-[var(--shadow-chip)]"
    >
      <header className="flex items-center justify-between border-b border-white/5 pb-3">
        <div className="flex items-center gap-3">
          <div className="flex size-8 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-amber-400">
            <IconAlertTriangle className="size-4" />
          </div>
          <div>
            <h2 className="text-fg text-sm font-semibold tracking-tight">Budget Controls & Threshold Alerts</h2>
            <p className="text-caption text-fg-subtle mt-0.5 text-xs">
              Configure monthly spend caps, set thresholds per provider, and select alert channels.
            </p>
          </div>
        </div>
        <span className="surface-chip text-fg-subtle rounded-md px-2 py-0.5 font-mono text-[11px] font-medium tracking-wider uppercase">
          Guardrails
        </span>
      </header>

      {/* Monthly Budget Limit */}
      <div className="flex flex-col gap-2">
        <label
          htmlFor="monthlyBudgetLimit"
          className="text-fg-muted font-mono text-[11px] font-semibold tracking-wider uppercase"
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
          className="surface-well border-white/10 h-10 max-w-[220px] rounded-lg font-mono text-sm"
        />
        <p className="text-caption text-fg-subtle text-xs">
          Hard circuit-breaker spend cap for the active calendar month. LLM inferences will halt when triggered.
        </p>
      </div>

      {/* Alert Channels */}
      <div className="flex flex-col gap-3">
        <span className="text-fg-muted font-mono text-[11px] font-semibold tracking-wider uppercase">
          Alert Channels (50%, 80%, 100% thresholds)
        </span>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="surface-well hover:border-white/20 flex cursor-pointer items-center gap-3 rounded-xl border border-white/10 p-3.5 transition-all select-none">
            <input
              type="checkbox"
              name="emailAlert"
              defaultChecked={!!initialAlertConfig.email}
              className="border-white/15 bg-bg-elev-2 text-cyan-400 focus:ring-cyan-500/20 size-4 cursor-pointer rounded-md"
            />
            <div className="flex items-center gap-2.5">
              <IconMail className="text-cyan-400 size-4" />
              <div className="flex flex-col">
                <span className="text-fg text-xs font-semibold">Email Alerts</span>
                <span className="text-fg-subtle text-[11px]">System notifications via configured SMTP / Resend</span>
              </div>
            </div>
          </label>

          <label className="surface-well hover:border-white/20 flex cursor-pointer items-center gap-3 rounded-xl border border-white/10 p-3.5 transition-all select-none">
            <input
              type="checkbox"
              name="telegramAlert"
              defaultChecked={!!initialAlertConfig.telegram}
              className="border-white/15 bg-bg-elev-2 text-cyan-400 focus:ring-cyan-500/20 size-4 cursor-pointer rounded-md"
            />
            <div className="flex items-center gap-2.5">
              <IconBrandTelegram className="text-cyan-400 size-4" />
              <div className="flex flex-col">
                <span className="text-fg text-xs font-semibold">Telegram Alerts</span>
                <span className="text-fg-subtle text-[11px]">Instant dispatch via Kestrel Telegram bot</span>
              </div>
            </div>
          </label>
        </div>
      </div>

      {/* Per-Provider Spending Thresholds */}
      <div className="flex flex-col gap-3">
        <span className="text-fg-muted font-mono text-[11px] font-semibold tracking-wider uppercase">
          Per-Provider Monthly Spending Thresholds
        </span>
        <div className="surface-well divide-y divide-white/5 overflow-hidden rounded-xl border border-white/10 shadow-inner">
          <div className="border-b border-white/10 bg-white/[0.03] text-fg-muted grid grid-cols-[1.5fr_1fr_1.2fr] items-center gap-2 px-4 py-2.5 font-mono text-[11px] font-bold tracking-wider uppercase">
            <span>Provider</span>
            <span className="text-right">Spend (MTD)</span>
            <span className="text-right">Threshold (USD)</span>
          </div>

          {providers.map((p) => {
            const hasExceeded = p.threshold ? p.currentSpend >= p.threshold : false;

            return (
              <div
                key={p.id}
                className="hover:bg-white/[0.02] grid grid-cols-[1.5fr_1fr_1.2fr] items-center gap-2 px-4 py-3 text-xs transition-colors"
              >
                <div className="flex flex-col">
                  <span className="text-fg font-medium">{p.displayName}</span>
                  <span className="text-fg-subtle mt-0.5 font-mono text-[11px]">{p.id}</span>
                </div>
                <div className="text-fg-subtle text-right font-mono tabular-nums">
                  <span className={hasExceeded ? 'text-danger font-bold' : 'font-medium'}>
                    ${p.currentSpend.toFixed(2)}
                  </span>
                </div>
                <div className="flex items-center justify-end">
                  <div className="relative w-full max-w-[110px]">
                    <span className="text-fg-subtle absolute top-1/2 left-2.5 -translate-y-1/2 font-mono text-xs">
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
                      className="surface-well border-white/10 h-8 pr-2 pl-6 text-right font-mono text-xs rounded-lg"
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="border-t border-white/5 flex justify-end pt-4">
        <Button type="submit" loading={pending} className="min-w-[130px] rounded-lg tactile-press">
          Save Changes
        </Button>
      </div>
    </form>
  );
}

