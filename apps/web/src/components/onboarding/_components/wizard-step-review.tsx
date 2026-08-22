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

import type { ProviderMeta } from '@kestrel/shared';
import { IconBolt, IconRobot, IconUser } from '@tabler/icons-react';

import { Button } from '@/components/ui/button';

import type { TradingStyle } from './wizard-types';

interface WizardStepReviewProps {
  name: string;
  timezone: string;
  tradingStyle: TradingStyle;
  selectedSymbols: string[];
  defaultSymbol: string;
  selectedProvider: string | null;
  providers: ProviderMeta[];
  isSubmitting: boolean;
  onBack: () => void;
  onSubmit: () => void;
}

export function WizardStepReview({
  name,
  timezone,
  tradingStyle,
  selectedSymbols,
  defaultSymbol,
  selectedProvider,
  providers,
  isSubmitting,
  onBack,
  onSubmit,
}: WizardStepReviewProps) {
  return (
    <div className="motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-right-4 flex flex-col gap-6">
      <div>
        <h2 className="text-fg mb-1 text-xl font-semibold">Review & Complete</h2>
        <p className="text-fg-subtle text-sm">Here is what we will configure for you:</p>
      </div>
      <ul className="text-fg border-border bg-bg-elev-2 list-inside list-disc space-y-1.5 rounded-sm border p-4 text-sm">
        <li>
          Display name: <span className="text-fg-subtle">{name || '—'}</span>
        </li>
        <li>
          Timezone: <span className="text-fg-subtle">{timezone}</span>
        </li>
        <li>
          Trading style:{' '}
          <span className="text-fg-subtle capitalize">{tradingStyle.replace('_', ' ')}</span>
        </li>
        <li>
          Watchlist: <span className="text-fg-subtle">{selectedSymbols.join(', ')}</span>
        </li>
        <li>
          Default chart symbol: <span className="text-fg-subtle">{defaultSymbol}</span>
        </li>
        <li>
          AI provider:{' '}
          <span className="text-fg-subtle">
            {selectedProvider
              ? `${providers.find((p) => p.id === selectedProvider)?.displayName} (key saved)`
              : 'skipped — set up later'}
          </span>
        </li>
      </ul>

      {/* Sample chat preview */}
      <details className="border-border rounded-sm border p-3">
        <summary className="text-fg-muted hover:text-fg cursor-pointer text-sm">
          Try a sample chat
        </summary>
        <div className="mt-3 flex flex-col gap-3">
          <p className="text-fg-subtle text-xs">
            A preview of what Kestrel can do. After setup, you will be able to ask about any symbol.
          </p>
          <div className="bg-bg-elev-2 flex flex-col gap-2 rounded-sm p-3">
            <div className="flex items-start gap-2">
              <div className="bg-bg-elev-3 mt-0.5 rounded-sm p-1.5">
                <IconUser className="text-fg size-3" />
              </div>
              <div className="text-fg flex-1 text-xs">How is XAUUSD looking?</div>
            </div>
            <div className="flex items-start gap-2">
              <div className="bg-bg-elev-2 mt-0.5 rounded-sm p-1.5">
                <IconRobot className="text-fg size-3" />
              </div>
              <div className="text-fg flex-1 space-y-1 text-xs leading-[1.4]">
                <p>
                  <span className="text-bull font-medium">XAUUSD</span> is showing mixed signals on
                  the 1H:
                </p>
                <ul className="text-fg-subtle list-inside list-disc">
                  <li>
                    Price consolidating above <span className="text-fg tabular-nums">$2,650</span>{' '}
                    support
                  </li>
                  <li>RSI at 54 — neutral</li>
                  <li>MACD histogram flattening — momentum fading</li>
                </ul>
                <p>
                  Bias: <span className="text-bear font-medium">Bearish below $2,640</span> · Key
                  resistance at <span className="tabular-nums">$2,680</span>
                </p>
              </div>
            </div>
          </div>
        </div>
      </details>

      <div className="flex gap-4">
        <Button variant="secondary" className="flex-1" onClick={onBack}>
          Back
        </Button>
        <Button
          className="flex-1"
          onClick={onSubmit}
          loading={isSubmitting}
          disabled={isSubmitting}
        >
          <IconBolt className="mr-1 size-4" /> Finish Setup
        </Button>
      </div>
    </div>
  );
}
