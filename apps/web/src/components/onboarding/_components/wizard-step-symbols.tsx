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
import { IconCheck, IconChevronRight } from '@tabler/icons-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';

interface WizardStepSymbolsProps {
  symbolsCatalog: SymbolCatalogRow[];
  selectedSymbols: string[];
  setSelectedSymbols: (symbols: string[]) => void;
  defaultSymbol: string;
  setDefaultSymbol: (symbol: string) => void;
  symbolsError: string | null;
  onNext: () => void;
  onBack: () => void;
}

export function WizardStepSymbols({
  symbolsCatalog,
  selectedSymbols,
  setSelectedSymbols,
  defaultSymbol,
  setDefaultSymbol,
  symbolsError,
  onNext,
  onBack,
}: WizardStepSymbolsProps) {
  return (
    <div className="motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-right-4 flex flex-col gap-6">
      <div>
        <h2 className="text-fg mb-1 text-xl font-semibold">Select Preferred Symbols</h2>
        <p className="text-fg-subtle text-sm">
          Choose the instruments you want in your default watchlist. Select at least one.
        </p>
        {symbolsError && (
          <p id="onboarding-symbols-error" role="alert" className="text-danger mt-1 text-xs">
            {symbolsError}
          </p>
        )}
      </div>
      <div className="grid max-h-72 grid-cols-1 gap-3 overflow-y-auto pr-1 sm:grid-cols-2">
        {symbolsCatalog.map((sym) => {
          const active = selectedSymbols.includes(sym.symbol);
          return (
            <button
              key={sym.symbol}
              type="button"
              onClick={() => {
                if (active) {
                  if (selectedSymbols.length > 1) {
                    const updated = selectedSymbols.filter((s) => s !== sym.symbol);
                    setSelectedSymbols(updated);
                    if (defaultSymbol === sym.symbol && updated.length > 0) {
                      setDefaultSymbol(updated[0]!);
                    }
                  } else {
                    toast.error('Select at least one symbol');
                  }
                } else {
                  setSelectedSymbols([...selectedSymbols, sym.symbol]);
                }
              }}
              aria-pressed={active}
              aria-describedby={symbolsError ? 'onboarding-symbols-error' : undefined}
              className={`hover:bg-bg-elev-2 relative flex min-h-11 cursor-pointer items-center justify-between rounded-sm border p-4 text-left transition-all ${
                active
                  ? 'border-border bg-bg-elev-1 ring-fg ring-1'
                  : 'border-border bg-bg-elev-1 hover:border-fg-muted'
              }`}
            >
              <div className="flex flex-col gap-0.5">
                <span className="text-fg font-mono text-sm font-semibold sm:text-base">
                  {sym.symbol}
                </span>
                <span className="text-fg-subtle text-xs">
                  {sym.name} ({sym.category})
                </span>
              </div>
              <div
                className={`flex size-5 items-center justify-center rounded-sm border transition-colors ${
                  active ? 'bg-fg border-border text-black' : 'border-border bg-bg-elev-1'
                }`}
              >
                {active && <IconCheck className="size-3.5 stroke-[3]" />}
              </div>
            </button>
          );
        })}
      </div>

      {selectedSymbols.length > 0 && (
        <div className="flex flex-col gap-2">
          <label className="text-fg text-sm font-medium" htmlFor="onboarding-default-symbol">
            Default Chart Symbol
          </label>
          <select
            id="onboarding-default-symbol"
            className="border-border bg-bg-elev-1 text-fg focus:ring-fg h-11 w-full cursor-pointer rounded-sm border px-3 py-2 text-sm focus:ring-1 focus:outline-none"
            value={defaultSymbol}
            onChange={(e) => setDefaultSymbol(e.target.value)}
          >
            {selectedSymbols.map((sym) => (
              <option key={sym} value={sym}>
                {sym}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="flex gap-4">
        <Button variant="secondary" className="flex-1" onClick={onBack}>
          Back
        </Button>
        <Button className="flex-1" onClick={onNext} disabled={selectedSymbols.length === 0}>
          Continue <IconChevronRight className="ml-2 size-4" />
        </Button>
      </div>
    </div>
  );
}
