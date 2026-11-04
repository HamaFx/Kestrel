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

// SPDX-License-Identifier: Apache-2.0
import { IconChevronDown, IconCpu } from '@tabler/icons-react';

import { usePopupMenu } from '@/hooks/use-popup-menu';
import { cn } from '@/lib/formatters/cn';

import { modelLabelFromSelection, providerLabelFromSelection } from './model-picker-utils';
import { RegenModelPicker } from './regen-model-picker';

interface ChatModelSelectorProps {
  /** Persisted `provider:model` value, or null when using the resolver default. */
  activeModelId: string | null;
  disabled?: boolean;
  onPick: (modelId: string) => void;
}

/**
 * Model selection for future chat turns. This intentionally reuses the same
 * authenticated catalog and capability filtering as "Regenerate with…" so
 * the chat page never exposes providers the user has not configured.
 */
export function ChatModelSelector({
  activeModelId,
  disabled = false,
  onPick,
}: ChatModelSelectorProps) {
  const menu = usePopupMenu({ focusFirstOnOpen: false });
  const label = modelLabelFromSelection(activeModelId);
  const provider = providerLabelFromSelection(activeModelId);

  return (
    <div className="relative shrink-0" ref={menu.menuRef}>
      <button
        ref={menu.triggerRef}
        type="button"
        disabled={disabled}
        onClick={menu.toggle}
        aria-label="Chat model"
        title={activeModelId ? `Chat model: ${label}` : 'Chat model: use configured default'}
        {...menu.triggerProps}
        className={cn(
          'surface-chip tactile-press text-fg-muted hover:text-fg hover:border-brand/40 inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 font-mono text-[11px] font-medium transition-all disabled:cursor-not-allowed disabled:opacity-50',
          menu.open && 'border-brand/50 text-fg',
        )}
      >
        <IconCpu
          className={cn('size-3.5 shrink-0', activeModelId ? 'text-brand' : 'text-fg-subtle')}
          aria-hidden="true"
        />
        {provider ? (
          <span className="text-fg-subtle hidden text-[10px] uppercase md:inline">{provider}</span>
        ) : null}
        <span className="hidden max-w-32 truncate sm:inline">{label}</span>
        <IconChevronDown
          className={cn(
            'size-3 shrink-0 transition-transform duration-150',
            menu.open && 'text-brand rotate-180',
          )}
          aria-hidden="true"
        />
      </button>

      {menu.open ? (
        <div
          {...menu.menuProps}
          className={cn(
            'surface-panel absolute bottom-full left-0 z-50 mb-2 rounded-xl border border-white/10 bg-[#141516]/95 p-2 shadow-2xl backdrop-blur-xl',
            'max-w-[calc(100vw-1.5rem)]',
          )}
        >
          <div className="border-border/40 text-fg-subtle mb-1 flex items-center justify-between border-b px-2 pb-1.5 font-mono text-[10px] tracking-wider uppercase">
            <span>Intelligence Engine</span>
            <span className="text-brand">Next Turn</span>
          </div>
          <RegenModelPicker
            popoverId={menu.menuId}
            activeModelId={activeModelId}
            onPick={(modelId) => {
              onPick(modelId);
              menu.close();
            }}
          />
        </div>
      ) : null}
    </div>
  );
}
