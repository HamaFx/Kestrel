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
import { IconArrowUp, IconMicrophone, IconPaperclip, IconSquare } from '@tabler/icons-react';
import { AnimatePresence, m } from 'motion/react';

import type { CustomAgentSummary } from '@/hooks/use-custom-agents';
import { cn } from '@/lib/formatters/cn';

import { ChatModelSelector } from './_components/chat-model-selector';
import { CustomAgentSelector } from './_components/custom-agent-selector';
import { MODE_DESCRIPTIONS, MODE_LABELS, type AnalysisMode } from './chat-top-bar';
import { formatCharCount, getCharCountTone, MAX_TEXT_CHARS } from './composer-helpers';
import type { ComposerController } from './use-composer';

export function ComposerControls({
  composer,
  analysisMode,
  onAnalysisModeChange,
  chatModel,
  onChatModelChange,
  customAgents,
  selectedAgentSlug,
  onAgentChange,
  disabled,
  isStreaming,
  onStop,
  contextUsagePercent,
}: {
  composer: ComposerController;
  analysisMode?: AnalysisMode | undefined;
  onAnalysisModeChange?: ((mode: AnalysisMode) => void) | undefined;
  chatModel?: string | null | undefined;
  onChatModelChange?: ((modelId: string) => void) | undefined;
  customAgents: readonly CustomAgentSummary[];
  selectedAgentSlug: string | null;
  onAgentChange?: ((slug: string | null) => void) | undefined;
  disabled?: boolean | undefined;
  isStreaming?: boolean | undefined;
  onStop?: (() => void) | undefined;
  contextUsagePercent?: number | undefined;
}) {
  const { value, images, fileInputRef, pickImages, voice, MAX_IMAGES } = composer;
  const charCount = value.length;
  const canSend =
    !disabled && !isStreaming && value.trim().length > 0 && charCount <= MAX_TEXT_CHARS;
  const charCountTone = getCharCountTone(charCount);
  const charCountClass =
    charCountTone === 'danger'
      ? 'text-danger font-semibold'
      : charCountTone === 'warn'
        ? 'text-warn font-medium'
        : 'text-fg-subtle';

  return (
    <div className="flex items-center justify-between gap-2 pt-1">
      <div className="flex min-w-0 flex-1 [scrollbar-width:none] flex-nowrap items-center gap-1.5 overflow-x-auto">
        <button
          type="button"
          aria-label="Attach image"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled || images.length >= MAX_IMAGES}
          className={cn(
            'text-fg-subtle hover:text-fg hover:bg-bg-elev-2 inline-flex size-9 shrink-0 items-center justify-center rounded-lg transition-colors',
            'focus-visible:ring-fg/60 focus:outline-none focus-visible:ring-2',
            disabled || images.length >= MAX_IMAGES ? 'cursor-not-allowed opacity-50' : '',
          )}
        >
          <IconPaperclip className="size-4" strokeWidth={1.75} />
        </button>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            void pickImages(e.currentTarget.files);
            e.currentTarget.value = '';
          }}
        />

        {voice.supported ? (
          <button
            type="button"
            aria-label={voice.active ? 'Stop voice input' : 'Start voice input'}
            aria-pressed={voice.active}
            onClick={() => (voice.active ? voice.stop() : voice.start())}
            disabled={disabled}
            className={cn(
              'text-fg-subtle hover:text-fg hover:bg-bg-elev-2 inline-flex size-9 shrink-0 items-center justify-center rounded-lg transition-colors',
              'focus-visible:ring-fg/60 focus:outline-none focus-visible:ring-2',
              voice.active ? 'text-danger bg-danger/10' : '',
              disabled ? 'cursor-not-allowed opacity-50' : '',
            )}
          >
            <IconMicrophone className="size-4" strokeWidth={1.75} />
          </button>
        ) : null}

        {analysisMode && onAnalysisModeChange && !selectedAgentSlug ? (
          <button
            type="button"
            onClick={() => {
              const modes: AnalysisMode[] = ['single', 'full'];
              const idx = modes.indexOf(analysisMode);
              const next = modes[(idx + 1) % modes.length];
              if (next) onAnalysisModeChange(next);
            }}
            title={MODE_DESCRIPTIONS[analysisMode]}
            aria-label={`Analysis mode: ${MODE_LABELS[analysisMode]}`}
            className={cn(
              'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-colors',
              analysisMode === 'full'
                ? 'border-brand/40 bg-brand/10 text-brand'
                : 'border-border bg-bg-elev-2 text-fg-muted hover:text-fg',
            )}
          >
            <span
              className={cn(
                'size-1.5 rounded-full',
                analysisMode === 'full' ? 'bg-brand' : 'bg-bull',
              )}
            />
            <span>{MODE_LABELS[analysisMode]}</span>
          </button>
        ) : null}

        {onChatModelChange ? (
          <ChatModelSelector
            activeModelId={chatModel ?? null}
            disabled={disabled}
            onPick={onChatModelChange}
          />
        ) : null}

        {onAgentChange ? (
          <CustomAgentSelector
            agents={customAgents}
            value={selectedAgentSlug}
            onChange={onAgentChange}
            disabled={disabled}
          />
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {typeof contextUsagePercent === 'number' && (
          <div
            title={`Context Window: ${contextUsagePercent}% used`}
            className="text-fg-subtle flex items-center gap-1.5 font-mono text-[11px] tabular-nums select-none"
          >
            <svg className="size-3.5 -rotate-90" viewBox="0 0 16 16" aria-hidden="true">
              <circle
                cx="8"
                cy="8"
                r="6"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="text-border"
              />
              <circle
                cx="8"
                cy="8"
                r="6"
                fill="none"
                stroke={
                  contextUsagePercent > 85
                    ? '#ff3616'
                    : contextUsagePercent > 60
                      ? '#d98f00'
                      : '#3f9e3d'
                }
                strokeWidth="2"
                strokeDasharray={37.7}
                strokeDashoffset={37.7 - (contextUsagePercent / 100) * 37.7}
                strokeLinecap="round"
                className="transition-all duration-300"
              />
            </svg>
            <span className="hidden sm:inline">{contextUsagePercent}%</span>
          </div>
        )}

        <span
          aria-live="polite"
          aria-label={`${charCount} of ${MAX_TEXT_CHARS} characters used`}
          className={cn('font-mono text-xs tabular-nums', charCountClass)}
        >
          {formatCharCount(charCount)}
        </span>

        <AnimatePresence mode="popLayout" initial={false}>
          {isStreaming && onStop ? (
            <m.button
              key="stop"
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.85 }}
              transition={{ duration: 0.15 }}
              type="button"
              onClick={onStop}
              aria-label="Stop generating"
              className="text-danger border-danger/40 bg-danger/15 inline-flex size-9 shrink-0 items-center justify-center rounded-lg border shadow-sm transition-transform active:scale-95"
            >
              <IconSquare className="size-3.5 fill-current" strokeWidth={0} />
            </m.button>
          ) : (
            <m.button
              key="send"
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.85 }}
              transition={{ duration: 0.15 }}
              type="submit"
              disabled={!canSend}
              aria-label="Send message"
              className={cn(
                'bg-brand text-white inline-flex size-9 shrink-0 items-center justify-center rounded-xl font-medium shadow-[0_2px_12px_rgba(255,54,22,0.35)] transition-all hover:brightness-110 active:scale-95',
                'disabled:cursor-not-allowed disabled:opacity-30 disabled:shadow-none',
              )}
            >
              <IconArrowUp className="size-4" strokeWidth={2.25} />
            </m.button>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
