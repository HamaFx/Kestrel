// SPDX-License-Identifier: Apache-2.0
// Onboarding wizard state machine: field state, progress restore (server
// payload + session storage), validation and the complete/skip submissions.

import { DEFAULT_WATCHLIST_SYMBOLS } from '@kestrel/shared';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { toast } from 'sonner';

import { completeOnboardingAction } from '@/app/onboarding/actions';

import type { TradingStyle } from '../_components/wizard-types';
import { LEGACY_ONBOARDING_STORAGE_KEY, ONBOARDING_STORAGE_KEY } from './wizard-storage-keys';

export function useOnboardingWizard({
  initialName,
  initialProgress,
}: {
  initialName: string;
  initialProgress?: Record<string, unknown> | null;
}) {
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

  // Load saved wizard state on mount
  useEffect(() => {
    try {
      const saved =
        sessionStorage.getItem(ONBOARDING_STORAGE_KEY) ??
        sessionStorage.getItem(LEGACY_ONBOARDING_STORAGE_KEY);
      if (saved && !initialProgress) {
        const parsed = JSON.parse(saved);
        sessionStorage.setItem(ONBOARDING_STORAGE_KEY, saved);
        sessionStorage.removeItem(LEGACY_ONBOARDING_STORAGE_KEY);
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

  function handleNameChange(value: string) {
    setName(value);
    setNameError(null);
  }

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
          sessionStorage.removeItem(ONBOARDING_STORAGE_KEY);
          sessionStorage.removeItem(LEGACY_ONBOARDING_STORAGE_KEY);
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
          sessionStorage.removeItem(ONBOARDING_STORAGE_KEY);
          sessionStorage.removeItem(LEGACY_ONBOARDING_STORAGE_KEY);
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

  return {
    step,
    name,
    handleNameChange,
    nameError,
    timezone,
    setTimezone,
    tradingStyle,
    setTradingStyle,
    selectedSymbols,
    setSelectedSymbols,
    defaultSymbol,
    setDefaultSymbol,
    symbolsError,
    isSubmitting,
    handleNext,
    handleBack,
    handleSubmit,
    handleSkip,
  };
}
