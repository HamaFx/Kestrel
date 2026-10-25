// SPDX-License-Identifier: Apache-2.0
// Persists wizard state: the sessionStorage mirror (with legacy-key
// migration) plus the debounced server-side save-progress call.

import { useEffect } from 'react';

import { apiMutate } from '@/lib/http/api-client';

import type { TradingStyle } from '../_components/wizard-types';
import { ONBOARDING_STORAGE_KEY } from './wizard-storage-keys';

export function useOnboardingPersistence({
  step,
  name,
  timezone,
  defaultSymbol,
  tradingStyle,
  selectedSymbols,
}: {
  step: number;
  name: string;
  timezone: string;
  defaultSymbol: string;
  tradingStyle: TradingStyle;
  selectedSymbols: string[];
}) {
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
      sessionStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify(state));
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
}
