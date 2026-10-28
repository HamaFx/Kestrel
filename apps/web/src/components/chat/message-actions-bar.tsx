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

// Copy / edit / regenerate controls for one message.
import {
  IconArrowBackUp,
  IconCheck,
  IconChevronDown,
  IconCopy,
  IconEdit,
} from '@tabler/icons-react';
import type { UIMessage } from 'ai';
import { useEffect, useState, type CSSProperties } from 'react';

import { Tooltip } from '@/components/ui/tooltip';

import { RegenModelPicker } from './_components/regen-model-picker';

const REGEN_MENU_TRIGGER = 'regen-menu-trigger';
const REGEN_CLOSE_ALL = 'kestrel:close-regen-menus';

function getMessageModel(message: UIMessage): string | null {
  const meta = message.metadata;
  if (meta && typeof meta === 'object' && 'model' in meta && typeof meta.model === 'string') {
    return meta.model;
  }
  return null;
}

export function MessageActionsBar({
  message,
  plainText,
  isUser,
  copied,
  onCopy,
  onRegenerate,
  onEditStart,
}: {
  message: UIMessage;
  plainText: string;
  isUser: boolean;
  copied: boolean;
  onCopy: () => void;
  onRegenerate?: ((opts?: { modelOverride?: string }) => void) | undefined;
  onEditStart?: (() => void) | undefined;
}) {
  const [hasPopoverSupport, setHasPopoverSupport] = useState(false);
  const [isOpenFallback, setIsOpenFallback] = useState(false);

  useEffect(() => {
    setHasPopoverSupport(
      typeof HTMLElement !== 'undefined' &&
        'popover' in HTMLElement.prototype &&
        typeof CSS !== 'undefined' &&
        CSS.supports('anchor-name', '--a') &&
        CSS.supports('position-anchor', '--a'),
    );
  }, []);

  useEffect(() => {
    if (hasPopoverSupport) return;
    const handleOutsideClick = (e: MouseEvent) => {
      if (!isOpenFallback) return;
      const target = e.target as HTMLElement;
      const insideMenu = target.closest(`[id^='regen-menu-']`);
      const insideBtn = target.closest(`button[data-action="${REGEN_MENU_TRIGGER}"]`);
      if (!insideMenu && !insideBtn) {
        document.dispatchEvent(new CustomEvent(REGEN_CLOSE_ALL));
      }
    };
    const closeAll = () => setIsOpenFallback(false);
    document.addEventListener('click', handleOutsideClick);
    document.addEventListener(REGEN_CLOSE_ALL, closeAll);
    return () => {
      document.removeEventListener('click', handleOutsideClick);
      document.removeEventListener(REGEN_CLOSE_ALL, closeAll);
    };
  }, [hasPopoverSupport, isOpenFallback]);

  const actionButtonClass =
    'surface-chip tactile-press text-fg-muted hover:text-fg hover:border-brand/40 focus-visible:ring-brand inline-flex size-9 items-center justify-center rounded-md transition-colors focus:outline-none focus-visible:ring-2 sm:size-8';

  return (
    <div
      className={
        'flex items-center gap-1.5 opacity-100 transition-opacity duration-150 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100'
      }
    >
      {plainText.length > 0 ? (
        <Tooltip label={copied ? 'Copied' : 'Copy'}>
          <button
            type="button"
            onClick={onCopy}
            aria-label={copied ? 'Copied' : 'Copy message'}
            className={actionButtonClass}
          >
            {copied ? (
              <IconCheck className="text-success size-4 sm:size-3.5" strokeWidth={2} />
            ) : (
              <IconCopy className="size-4 sm:size-3.5" strokeWidth={1.75} />
            )}
          </button>
        </Tooltip>
      ) : null}
      {isUser && onEditStart ? (
        <Tooltip label="Edit prompt">
          <button
            type="button"
            onClick={onEditStart}
            aria-label="Edit prompt"
            className={actionButtonClass}
          >
            <IconEdit className="size-4 sm:size-3.5" strokeWidth={1.75} />
          </button>
        </Tooltip>
      ) : null}
      {onRegenerate ? (
        <div className="surface-chip relative inline-flex overflow-hidden rounded-md">
          <Tooltip label="Regenerate">
            <button
              type="button"
              onClick={() => onRegenerate()}
              aria-label="Regenerate response"
              className="tactile-press text-fg-muted hover:text-fg hover:bg-white/[0.04] focus-visible:ring-brand inline-flex size-9 items-center justify-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset sm:size-8"
            >
              <IconArrowBackUp className="size-4 sm:size-3.5" strokeWidth={1.75} />
            </button>
          </Tooltip>
          <Tooltip label="Regenerate with…">
            <button
              type="button"
              popoverTarget={hasPopoverSupport ? `regen-menu-${message.id}` : undefined}
              onClick={hasPopoverSupport ? undefined : () => setIsOpenFallback(!isOpenFallback)}
              aria-label="Regenerate with a different model"
              data-action={REGEN_MENU_TRIGGER}
              className="tactile-press text-fg-muted hover:text-fg hover:bg-white/[0.04] focus-visible:ring-brand border-border/70 inline-flex h-9 min-w-[30px] items-center justify-center border-l px-1.5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset sm:h-8 sm:min-w-[26px]"
              style={
                hasPopoverSupport
                  ? ({ anchorName: `--regen-btn-${message.id}` } as CSSProperties)
                  : undefined
              }
            >
              <IconChevronDown className="size-3.5" strokeWidth={1.75} />
            </button>
          </Tooltip>
          <div
            id={`regen-menu-${message.id}`}
            popover={hasPopoverSupport ? 'auto' : undefined}
            role="menu"
            className={`surface-panel m-0 rounded-xl p-1 ${
              !hasPopoverSupport ? 'absolute right-0 bottom-full z-50 mb-2' : ''
            } ${!hasPopoverSupport && !isOpenFallback ? 'hidden' : ''}`}
            style={
              hasPopoverSupport
                ? ({
                    minWidth: '12rem',
                    positionAnchor: `--regen-btn-${message.id}`,
                    bottom: 'calc(anchor(top) + 8px)',
                    right: 'anchor(right)',
                    position: 'fixed',
                  } as CSSProperties)
                : { minWidth: '12rem' }
            }
          >
            <RegenModelPicker
              popoverId={`regen-menu-${message.id}`}
              activeModelId={getMessageModel(message)}
              onPick={(modelId) => {
                onRegenerate({ modelOverride: modelId });
                setIsOpenFallback(false);
              }}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
