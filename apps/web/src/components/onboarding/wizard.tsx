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
import type { SymbolCatalogRow } from '@kestrel/db';
import { DEFAULT_WATCHLIST_SYMBOLS, type ProviderMeta } from '@kestrel/shared';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { toast } from 'sonner';

import { completeOnboardingAction } from '@/app/onboarding/actions';
import { apiMutate } from '@/lib/api-client';

import { WizardStepProfile } from './_components/wizard-step-profile';
import { WizardStepReview } from './_components/wizard-step-review';
import { WizardStepStyle } from './_components/wizard-step-style';
import { WizardStepSymbols } from './_components/wizard-step-symbols';
import { WizardStepper } from './_components/wizard-stepper';
import type { TradingStyle } from './_components/wizard-types';

interface OnboardingWizardProps {
  initialName: string;
  providers?: ProviderMeta[];
  symbolsCatalog: SymbolCatalogRow[];
  initialProgress?: Record<string, unknown> | null;
}

export function OnboardingWizard({
  initialName,
  symbolsCatalog,
  initialProgress,
}: OnboardingWizardProps) {
  const [step, setStep] = useState(1);
  const [isSubmitting, startSubmit] = useTransition();
  const [nameError, setNameError] = useState<string | null>(null);
  const [symbolsError, setSymbolsError] = useState<string | null>(null);
  const router = useRouter();

  const [name, setName] = useState(initialName);
  const [timezone, setTimezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [tradingStyle, setTradingStyle] = useState<TradingStyle>('day_trader');
  const [selectedSymbols, setSelectedSymbols] = useState<string[]>([...DEFAULT_WATCHLIST_SYMBOLS]);
  const [defaultSymbol, setDefaultSymbol] = useState<string>(DEFAULT_WATCHLIST_SYMBOLS[0]);

  // Restore server-side progress on mount (clamped to 4 steps)
  useEffect(() => {
    if (initialProgress) {
      const p = initialProgress;
      if (typeof p.step === 'number') setStep(Math.min(4, Math.max(1, p.step)));
      if (typeof p.name === 'string') setName(p.name);
      if (typeof p.timezone === 'string') setTimezone(p.timezone);
      if (typeof p.defaultSymbol === 'string') setDefaultSymbol(p.defaultSymbol);
      if (typeof p.tradingStyle === 'string') setTradingStyle(p.tradingStyle as TradingStyle);
      if (Array.isArray(p.selectedSymbols)) setSelectedSymbols(p.selectedSymbols as string[]);
    }
  }, [initialProgress]);

  const onboardingStorageKey = 'kestrel_onboarding_wizard';
  const legacyOnboardingStorageKey = 'hfx_onboarding_wizard';

  // Load saved wizard state on mount
  useEffect(() => {
    try {
      const saved =
        sessionStorage.getItem(onboardingStorageKey) ??
        sessionStorage.getItem(legacyOnboardingStorageKey);
      if (saved && !initialProgress) {
        const parsed = JSON.parse(saved);
        sessionStorage.setItem(onboardingStorageKey, saved);
        sessionStorage.removeItem(legacyOnboardingStorageKey);
        if (typeof parsed.step === 'number') setStep(Math.min(4, Math.max(1, parsed.step)));
        if (typeof parsed.name === 'string') setName(parsed.name);
        if (typeof parsed.timezone === 'string') setTimezone(parsed.timezone);
        if (typeof parsed.defaultSymbol === 'string') setDefaultSymbol(parsed.defaultSymbol);
        if (typeof parsed.tradingStyle === 'string') setTradingStyle(parsed.tradingStyle);
        if (Array.isArray(parsed.selectedSymbols)) setSelectedSymbols(parsed.selectedSymbols);
      }
    } catch (e) {
      console.warn('Failed to restore onboarding state', e);
    }
  }, [initialProgress]);

  // Save wizard state when any field changes
  useEffect(() => {
    try {
      const state = {
        step,
        name,
        timezone,
        defaultSymbol,
        tradingStyle,
        selectedSymbols,
      };
      sessionStorage.setItem(onboardingStorageKey, JSON.stringify(state));
    } catch {
      // ignore
    }
  }, [step, name, timezone, defaultSymbol, tradingStyle, selectedSymbols]);

  // Server-side progress save (debounced 2s, skip step 1)
  useEffect(() => {
    if (step <= 1) return;
    const timer = setTimeout(() => {
      apiMutate('/api/onboarding/save-progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          step,
          name,
          timezone,
          defaultSymbol,
          selectedProvider: null,
          tradingStyle,
          selectedSymbols,
        }),
      }).catch((err) => {
        console.warn('onboarding save-progress failed', err);
      });
    }, 2000);
    return () => clearTimeout(timer);
  }, [step, name, timezone, defaultSymbol, tradingStyle, selectedSymbols]);

  function validateStep(s: number): string | null {
    switch (s) {
      case 1:
        if (name.trim().length < 2) return 'Please enter your name (at least 2 characters)';
        return null;
      case 3:
        if (selectedSymbols.length < 1) return 'Please select at least one symbol';
        return null;
      default:
        return null;
    }
  }

  const handleNext = () => {
    const error = validateStep(step);
    if (error) {
      if (step === 1) setNameError(error);
      if (step === 3) setSymbolsError(error);
      toast.error(error);
      return;
    }
    setNameError(null);
    setSymbolsError(null);
    setStep((s) => Math.min(4, s + 1));
  };
  const handleBack = () => setStep((s) => Math.max(1, s - 1));

  function handleSubmit() {
    startSubmit(async () => {
      try {
        const currentPrefs = JSON.parse(
          localStorage.getItem('kestrel:prefs:v1') ?? localStorage.getItem('hamafx:prefs') ?? '{}',
        );
        localStorage.setItem(
          'kestrel:prefs:v1',
          JSON.stringify({
            ...currentPrefs,
            defaultSymbol: defaultSymbol || selectedSymbols[0] || DEFAULT_WATCHLIST_SYMBOLS[0],
            timeFormat: currentPrefs.timeFormat || '24h',
            reduceMotion: currentPrefs.reduceMotion || false,
            tradingStyle: tradingStyle,
          }),
        );
        localStorage.removeItem('hamafx:prefs');
      } catch {
        // ignore
      }

      const payload = {
        displayName: name,
        timezone,
        defaultSymbol: defaultSymbol || selectedSymbols[0] || DEFAULT_WATCHLIST_SYMBOLS[0],
        symbols: selectedSymbols,
        tradingStyle,
        apiKeys: {},
      };
      const fd = new FormData();
      fd.append('payload', JSON.stringify(payload));
      try {
        const res = await completeOnboardingAction(fd);
        if (res.ok) {
          sessionStorage.removeItem(onboardingStorageKey);
          sessionStorage.removeItem(legacyOnboardingStorageKey);
          router.push('/dashboard');
          router.refresh();
        } else {
          toast.error(res.error || 'Failed to complete onboarding');
        }
      } catch (err) {
        console.error(err);
        toast.error('An unexpected error occurred');
      }
    });
  }

  function handleSkip() {
    startSubmit(async () => {
      const fd = new FormData();
      fd.append(
        'payload',
        JSON.stringify({
          displayName: name,
          timezone,
          defaultSymbol: selectedSymbols[0] || DEFAULT_WATCHLIST_SYMBOLS[0],
          symbols: selectedSymbols,
          tradingStyle,
          apiKeys: {},
        }),
      );
      try {
        const res = await completeOnboardingAction(fd);
        if (res.ok) {
          sessionStorage.removeItem(onboardingStorageKey);
          sessionStorage.removeItem(legacyOnboardingStorageKey);
          router.push('/dashboard');
          router.refresh();
        } else {
          toast.error(res.error || 'Failed to skip');
        }
      } catch (err) {
        console.error(err);
        toast.error('An unexpected error occurred');
      }
    });
  }

  return (
    <div className="surface-panel rounded-2xl border border-white/10 p-6 shadow-[var(--shadow-chip)] sm:p-8">
      <WizardStepper step={step} />

      <div className="mb-4 flex justify-end">
        <button
          type="button"
          onClick={handleSkip}
          disabled={isSubmitting}
          className="text-fg-subtle hover:text-fg text-xs transition-colors"
        >
          Skip setup, explore dashboard first →
        </button>
      </div>

      {step === 1 && (
        <WizardStepProfile
          name={name}
          setName={(v) => {
            setName(v);
            setNameError(null);
          }}
          nameError={nameError}
          timezone={timezone}
          setTimezone={setTimezone}
          onNext={handleNext}
        />
      )}

      {step === 2 && (
        <WizardStepStyle
          tradingStyle={tradingStyle}
          setTradingStyle={setTradingStyle}
          onNext={handleNext}
          onBack={handleBack}
        />
      )}

      {step === 3 && (
        <WizardStepSymbols
          symbolsCatalog={symbolsCatalog}
          selectedSymbols={selectedSymbols}
          setSelectedSymbols={setSelectedSymbols}
          defaultSymbol={defaultSymbol}
          setDefaultSymbol={setDefaultSymbol}
          symbolsError={symbolsError}
          onNext={handleNext}
          onBack={handleBack}
        />
      )}

      {step === 4 && (
        <WizardStepReview
          name={name}
          timezone={timezone}
          tradingStyle={tradingStyle}
          selectedSymbols={selectedSymbols}
          defaultSymbol={defaultSymbol}
          isSubmitting={isSubmitting}
          onBack={handleBack}
          onSubmit={handleSubmit}
        />
      )}
    </div>
  );
}
