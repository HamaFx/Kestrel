'use client';

// SPDX-License-Identifier: Apache-2.0

// Step panels for the onboarding wizard: profile, style, symbols and review.
import type { SymbolCatalogRow } from '@kestrel/db';

import { WizardStepProfile } from '../_components/wizard-step-profile';
import { WizardStepReview } from '../_components/wizard-step-review';
import { WizardStepStyle } from '../_components/wizard-step-style';
import { WizardStepSymbols } from '../_components/wizard-step-symbols';
import type { TradingStyle } from '../_components/wizard-types';

export interface WizardPanelsProps {
  step: number;
  name: string;
  setName: (value: string) => void;
  nameError: string | null;
  timezone: string;
  setTimezone: (value: string) => void;
  tradingStyle: TradingStyle;
  setTradingStyle: (style: TradingStyle) => void;
  symbolsCatalog: SymbolCatalogRow[];
  selectedSymbols: string[];
  setSelectedSymbols: (symbols: string[]) => void;
  defaultSymbol: string;
  setDefaultSymbol: (symbol: string) => void;
  symbolsError: string | null;
  isSubmitting: boolean;
  onNext: () => void;
  onBack: () => void;
  onSubmit: () => void;
}

export function WizardPanels({
  step,
  name,
  setName,
  nameError,
  timezone,
  setTimezone,
  tradingStyle,
  setTradingStyle,
  symbolsCatalog,
  selectedSymbols,
  setSelectedSymbols,
  defaultSymbol,
  setDefaultSymbol,
  symbolsError,
  isSubmitting,
  onNext,
  onBack,
  onSubmit,
}: WizardPanelsProps) {
  return (
    <>
      {step === 1 && (
        <WizardStepProfile
          name={name}
          setName={setName}
          nameError={nameError}
          timezone={timezone}
          setTimezone={setTimezone}
          onNext={onNext}
        />
      )}

      {step === 2 && (
        <WizardStepStyle
          tradingStyle={tradingStyle}
          setTradingStyle={setTradingStyle}
          onNext={onNext}
          onBack={onBack}
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
          onNext={onNext}
          onBack={onBack}
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
          onBack={onBack}
          onSubmit={onSubmit}
        />
      )}
    </>
  );
}
