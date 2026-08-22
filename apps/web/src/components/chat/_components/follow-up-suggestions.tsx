// SPDX-License-Identifier: Apache-2.0

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
import { IconArrowRight, IconSparkles } from '@tabler/icons-react';
import type { UIMessage } from 'ai';
import { m } from 'motion/react';
import { useMemo } from 'react';

import { cn } from '@/lib/cn';

interface FollowUpSuggestionsProps {
  message: UIMessage;
  onSelect: (prompt: string) => void;
  disabled?: boolean;
}

export function FollowUpSuggestions({ message, onSelect, disabled }: FollowUpSuggestionsProps) {
  const suggestions = useMemo(() => {
    const rawText =
      message.parts
        ?.filter((p) => p.type === 'text')
        .map((p) => ('text' in p ? p.text : ''))
        .join(' ')
        .toLowerCase() ?? '';

    if (
      rawText.includes('cpi') ||
      rawText.includes('nfp') ||
      rawText.includes('fomc') ||
      rawText.includes('news')
    ) {
      return [
        'What is the historical price reaction during this release?',
        'What levels would invalidate this news bias?',
        'Show 15m order flow reaction levels',
      ];
    }

    if (rawText.includes('long') || rawText.includes('bullish') || rawText.includes('breakout')) {
      return [
        'Where is the next major liquidity target if this holds?',
        'What if DXY strengthens against this setup?',
        'Check higher timeframe 4H structure confirmation',
      ];
    }

    if (rawText.includes('short') || rawText.includes('bearish') || rawText.includes('sweep')) {
      return [
        'Where are buyers most likely to defend support?',
        'What is the optimal Risk-to-Reward on a pullback?',
        'Check institutional COT positioning on this pair',
      ];
    }

    return [
      'What is the key invalidation price for this idea?',
      'Check higher timeframe 4H structure confirmation',
      'What high-impact economic news is coming up next?',
    ];
  }, [message]);

  if (suggestions.length === 0) return null;

  return (
    <m.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.1 }}
      className="border-border/40 mt-3 flex flex-col gap-1.5 border-t pt-2"
    >
      <div className="text-caption text-fg-subtle flex items-center gap-1.5">
        <IconSparkles className="text-brand size-3" />
        <span className="text-[10px] font-semibold tracking-wider uppercase">
          Suggested Follow-ups
        </span>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {suggestions.map((prompt, idx) => (
          <button
            key={idx}
            type="button"
            disabled={disabled}
            onClick={() => onSelect(prompt)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-sm border px-2.5 py-1 text-left text-xs transition-all',
              'border-border/70 bg-bg-elev-1 text-fg-muted hover:text-fg hover:border-brand/40 hover:bg-bg-elev-2 active:scale-95',
              'focus-visible:ring-brand focus:outline-none focus-visible:ring-1 disabled:pointer-events-none disabled:opacity-50',
            )}
            title={prompt}
          >
            <span>{prompt}</span>
            <IconArrowRight className="text-fg-subtle group-hover:text-brand size-3 shrink-0" />
          </button>
        ))}
      </div>
    </m.div>
  );
}
