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

import type { UIMessage } from 'ai';
import { useMemo, useState } from 'react';

import { Tooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/cn';

interface ThreadTocRailProps {
  messages: UIMessage[];
  onScrollToTurn: (messageIndex: number) => void;
  activeTurnIndex?: number;
}

/**
 * Floating vertical Table-of-Contents micro-rail matching Hoplite:
 * Shows turn-by-turn navigation dots along the chat edge when a thread
 * contains multiple user turns. Hovering previews the user prompt.
 */
export function ThreadTocRail({
  messages,
  onScrollToTurn,
  activeTurnIndex,
}: ThreadTocRailProps) {
  const userTurns = useMemo(() => {
    return messages
      .map((msg, index) => {
        const textPart = msg.parts?.find(
          (p): p is { type: 'text'; text: string } => p.type === 'text',
        );
        return {
          id: msg.id,
          index,
          text: textPart?.text ?? 'Prompt',
          role: msg.role,
        };
      })
      .filter((m) => m.role === 'user');
  }, [messages]);

  // Only display rail if there are at least 2 user turns
  if (userTurns.length < 2) return null;

  return (
    <nav
      aria-label="Conversation turns"
      className="fixed right-3 top-1/2 z-20 hidden -translate-y-1/2 flex-col items-center gap-2 rounded-full border border-white/10 bg-black/40 px-1 py-2 backdrop-blur-md transition-opacity duration-200 xl:flex hover:bg-black/60"
    >
      {userTurns.map((turn, turnIdx) => {
        const isActive = activeTurnIndex === turn.index;
        const preview =
          turn.text.length > 45 ? `${turn.text.slice(0, 45)}…` : turn.text;

        return (
          <Tooltip
            key={turn.id}
            label={`#${turnIdx + 1}: ${preview}`}
            side="top"
          >
            <button
              type="button"
              onClick={() => onScrollToTurn(turn.index)}
              aria-label={`Jump to turn ${turnIdx + 1}`}
              className={cn(
                'group relative flex size-3 items-center justify-center rounded-full transition-all active:scale-90',
                isActive && 'scale-110',
              )}
            >
              <span
                className={cn(
                  'rounded-full transition-all duration-150',
                  isActive
                    ? 'size-2 bg-brand shadow-[0_0_6px_var(--color-brand)]'
                    : 'size-1.5 bg-white/25 group-hover:size-2 group-hover:bg-white/80',
                )}
              />
            </button>
          </Tooltip>
        );
      })}
    </nav>
  );
}
