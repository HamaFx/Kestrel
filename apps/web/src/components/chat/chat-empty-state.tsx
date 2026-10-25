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
import type { Symbol } from '@kestrel/shared';
import { useMemo } from 'react';

import { chatErrorText } from '@/lib/chat-transport';

import { PixelDeskStandby } from './parts/pixel-desk/pixel-desk';

export function ChatErrorBanner({ error }: { error: Error }) {
  return (
    <div
      role="alert"
      className="border-danger/30 bg-danger/10 text-danger mb-2 flex flex-wrap items-center justify-between gap-2 rounded-sm border px-3 py-2 text-xs"
    >
      <span>{chatErrorText(error)}</span>
    </div>
  );
}

export function ChatEmptyState({
  pinnedSymbol,
  disabled,
  onSelect,
}: {
  pinnedSymbol: Symbol | null;
  disabled?: boolean;
  onSelect: (text: string) => void;
}) {
  const examplePrompts = useMemo(() => {
    const sym = pinnedSymbol ?? 'XAUUSD';
    return [
      `Analyze ${sym} 4H structure`,
      'Compare EURUSD vs GBPUSD',
      `Key liquidation levels for ${sym}`,
    ];
  }, [pinnedSymbol]);

  return (
    <div className="flex min-h-[64svh] flex-col items-center justify-center gap-5 px-2 py-6">
      <div className="flex w-full max-w-2xl flex-col items-start gap-1 text-left">
        <h2 className="text-fg font-display text-lg font-semibold tracking-tight sm:text-xl">
          Market Research & Committee Desk
        </h2>
        <p className="text-fg-muted text-xs sm:text-sm">
          Select an instrument to run a 4-desk consensus review or ask a direct question below.
        </p>
      </div>
      <div className="flex w-full max-w-2xl flex-wrap items-center gap-2">
        {examplePrompts.map((prompt) => (
          <button
            key={prompt}
            type="button"
            disabled={disabled}
            onClick={() => onSelect(prompt)}
            className="surface-button text-fg-muted hover:text-fg flex items-center gap-1.5 rounded-[12px] px-3 py-1.5 font-mono text-xs transition-all active:translate-y-[0.5px] disabled:pointer-events-none disabled:opacity-50"
          >
            <span className="text-brand select-none">›</span>
            <span>{prompt}</span>
          </button>
        ))}
      </div>
      <div className="flex w-full max-w-2xl justify-center">
        <PixelDeskStandby
          pinnedSymbol={pinnedSymbol}
          onSelectPrompt={onSelect}
          disabled={disabled}
        />
      </div>
    </div>
  );
}
