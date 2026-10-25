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
import type { ProviderMeta } from '@kestrel/shared';

import { WizardStepper } from '../_components/wizard-stepper';
import { useOnboardingPersistence } from './use-onboarding-persistence';
import { useOnboardingWizard } from './use-onboarding-wizard';
import { WizardPanels } from './wizard-panels';

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
  const wizard = useOnboardingWizard({ initialName, initialProgress });

  useOnboardingPersistence({
    step: wizard.step,
    name: wizard.name,
    timezone: wizard.timezone,
    defaultSymbol: wizard.defaultSymbol,
    tradingStyle: wizard.tradingStyle,
    selectedSymbols: wizard.selectedSymbols,
  });

  return (
    <div className="surface-panel rounded-2xl border border-white/10 p-6 shadow-[var(--shadow-chip)] sm:p-8">
      <WizardStepper step={wizard.step} />

      <div className="mb-4 flex justify-end">
        <button
          type="button"
          onClick={wizard.handleSkip}
          disabled={wizard.isSubmitting}
          className="text-fg-subtle hover:text-fg text-xs transition-colors"
        >
          Skip setup, explore dashboard first →
        </button>
      </div>

      <WizardPanels
        step={wizard.step}
        name={wizard.name}
        setName={wizard.handleNameChange}
        nameError={wizard.nameError}
        timezone={wizard.timezone}
        setTimezone={wizard.setTimezone}
        tradingStyle={wizard.tradingStyle}
        setTradingStyle={wizard.setTradingStyle}
        symbolsCatalog={symbolsCatalog}
        selectedSymbols={wizard.selectedSymbols}
        setSelectedSymbols={wizard.setSelectedSymbols}
        defaultSymbol={wizard.defaultSymbol}
        setDefaultSymbol={wizard.setDefaultSymbol}
        symbolsError={wizard.symbolsError}
        isSubmitting={wizard.isSubmitting}
        onNext={wizard.handleNext}
        onBack={wizard.handleBack}
        onSubmit={wizard.handleSubmit}
      />
    </div>
  );
}
