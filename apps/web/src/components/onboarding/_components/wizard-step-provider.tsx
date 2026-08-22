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

import type { ProviderMeta, ProviderPricingTier } from '@kestrel/shared';
import { IconCheck, IconChevronRight, IconEye, IconEyeOff, IconLoader2 } from '@tabler/icons-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ProviderInfoDot } from '@/components/ui/provider-info-dot';

import type { TestState } from './wizard-types';

interface WizardStepProviderProps {
  providers: ProviderMeta[];
  selectedProvider: string | null;
  setSelectedProvider: (id: string | null) => void;
  apiKey: string;
  setApiKey: (key: string) => void;
  revealed: boolean;
  setRevealed: (revealed: boolean) => void;
  testState: TestState;
  onTestKey: () => void;
  onNext: () => void;
  onBack: () => void;
  onSkipProvider: () => void;
}

function tierLabel(tier: ProviderPricingTier) {
  switch (tier) {
    case 'free':
      return 'Free tier';
    case 'low':
      return 'Low cost';
    case 'medium':
      return 'Paid';
    case 'high':
      return 'Premium';
  }
}

export function WizardStepProvider({
  providers,
  selectedProvider,
  setSelectedProvider,
  apiKey,
  setApiKey,
  revealed,
  setRevealed,
  testState,
  onTestKey,
  onNext,
  onBack,
  onSkipProvider,
}: WizardStepProviderProps) {
  return (
    <div className="motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-right-4 flex flex-col gap-6">
      <div>
        <h2 className="text-fg mb-1 text-xl font-semibold">Connect an AI Provider</h2>
        <p className="text-fg-subtle text-sm">
          Kestrel is BYOK (Bring Your Own Key). Pick a provider below and paste your API key. You
          can add more or change providers later in Settings.
        </p>
      </div>

      <div className="grid max-h-64 grid-cols-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
        {providers.map((p) => {
          const selected = selectedProvider === p.id;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                setSelectedProvider(p.id);
              }}
              aria-pressed={selected}
              className={`min-h-11 rounded-sm border p-3 text-left transition-colors ${
                selected
                  ? 'border-border bg-bg-elev-2 ring-fg ring-1'
                  : 'border-border bg-bg-elev-1 hover:border-fg-subtle'
              }`}
            >
              <div className="flex items-baseline justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <div className="text-fg text-sm font-medium">{p.displayName}</div>
                  <ProviderInfoDot provider={p} />
                </div>
                <div className="text-fg-subtle text-xs">{tierLabel(p.pricingTier)}</div>
              </div>
              <div className="text-fg-subtle mt-1 line-clamp-2 text-xs">{p.description}</div>
            </button>
          );
        })}
      </div>

      {selectedProvider && (
        <div className="motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-2 flex flex-col gap-3">
          <label className="text-fg text-sm font-medium" htmlFor="onboarding-api-key">
            API Key for {providers.find((p) => p.id === selectedProvider)?.displayName}
          </label>
          <div className="relative">
            <Input
              id="onboarding-api-key"
              type={revealed ? 'text' : 'password'}
              value={apiKey}
              onChange={(e) => {
                setApiKey(e.target.value);
              }}
              placeholder={providers.find((p) => p.id === selectedProvider)?.keyHint}
              autoComplete="off"
              spellCheck={false}
              className="pr-20"
            />
            <div className="absolute top-1/2 right-2 flex -translate-y-1/2 items-center gap-1">
              <button
                type="button"
                onClick={() => setRevealed(!revealed)}
                className="text-fg-subtle hover:text-fg p-1 transition-colors"
                aria-label={revealed ? 'Hide key' : 'Show key'}
              >
                {revealed ? <IconEyeOff className="size-4" /> : <IconEye className="size-4" />}
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={apiKey.trim().length < 8 || testState.kind === 'pending'}
              onClick={onTestKey}
            >
              {testState.kind === 'pending' ? (
                <>
                  <IconLoader2 className="mr-1 size-3 animate-spin" />
                  Testing
                </>
              ) : (
                'Test Connection'
              )}
            </Button>
            {testState.kind === 'ok' && (
              <span className="text-success flex items-center gap-1 text-xs">
                <IconCheck className="size-3" /> Key looks valid
              </span>
            )}
            {testState.kind === 'err' && (
              <span role="alert" className="text-danger text-xs">
                {testState.message}
              </span>
            )}
          </div>
        </div>
      )}

      {!selectedProvider && (
        <p className="text-fg-subtle text-xs">
          Tip: choose a free-tier provider to try things out without spending.
        </p>
      )}

      <div className="flex gap-4">
        <Button variant="secondary" className="flex-1" onClick={onBack}>
          Back
        </Button>
        <Button
          className="flex-1"
          onClick={onNext}
          disabled={!selectedProvider || apiKey.trim().length < 8}
        >
          Continue <IconChevronRight className="ml-2 size-4" />
        </Button>
      </div>
      <button
        type="button"
        onClick={onSkipProvider}
        className="text-fg-subtle hover:text-fg mt-2 w-full text-center text-xs transition-colors"
      >
        Skip for now (configure later in Settings)
      </button>
    </div>
  );
}
