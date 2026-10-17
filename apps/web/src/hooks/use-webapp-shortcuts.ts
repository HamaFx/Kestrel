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

import { useEffect } from 'react';

interface WebappShortcutsOptions {
  onFocusComposer?: () => void;
  onToggleViews?: () => void;
  onNextTurn?: () => void;
  onPrevTurn?: () => void;
  onNewThread?: () => void;
  enabled?: boolean;
}

/**
 * Vim-inspired single-key ergonomics matching Hoplite:
 * - 'c': Focus composer textarea
 * - '[' or ']': Toggle docked views sidecar
 * - 'j' / 'k': Jump down / up conversation turns
 *
 * Fully suppressed when typing in inputs, textareas, or contentEditable.
 */
export function useWebappShortcuts({
  onFocusComposer,
  onToggleViews,
  onNextTurn,
  onPrevTurn,
  onNewThread,
  enabled = true,
}: WebappShortcutsOptions) {
  useEffect(() => {
    if (!enabled) return;

    function handleKeyDown(e: KeyboardEvent) {
      // Never intercept when typing into an input field or with meta/ctrl modifiers
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }

      switch (e.key) {
        case 'c':
        case 'C': {
          e.preventDefault();
          onFocusComposer?.();
          break;
        }
        case '[':
        case ']': {
          e.preventDefault();
          onToggleViews?.();
          break;
        }
        case 'j':
        case 'J': {
          e.preventDefault();
          onNextTurn?.();
          break;
        }
        case 'k':
        case 'K': {
          e.preventDefault();
          onPrevTurn?.();
          break;
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [enabled, onFocusComposer, onToggleViews, onNextTurn, onPrevTurn, onNewThread]);
}
