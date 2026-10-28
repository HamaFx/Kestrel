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
import type { AnalysisMode } from './chat-top-bar';
import { formatCharCount, getCharCountTone, MAX_TEXT_CHARS } from './composer-helpers';
import { ComposerModePill } from './composer-mode-pill';
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
            'tactile-press text-fg-subtle hover:text-fg hover:bg-bg-elev-2 inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-transparent transition-all hover:border-white/10',
            'focus-visible:ring-brand focus:outline-none focus-visible:ring-2',
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
              'tactile-press text-fg-subtle hover:text-fg hover:bg-bg-elev-2 inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-transparent transition-all hover:border-white/10',
              'focus-visible:ring-brand focus:outline-none focus-visible:ring-2',
              voice.active ? 'text-danger bg-danger/15 border-danger/40 mic-pulse' : '',
              disabled ? 'cursor-not-allowed opacity-50' : '',
            )}
          >
            <IconMicrophone className="size-4" strokeWidth={1.75} />
          </button>
        ) : null}

        {analysisMode && onAnalysisModeChange && !selectedAgentSlug ? (
          <ComposerModePill
            analysisMode={analysisMode}
            onAnalysisModeChange={onAnalysisModeChange}
          />
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
                    ? '#f03e3e'
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
              className="tactile-press text-danger border-danger/50 bg-danger/15 hover:bg-danger/25 inline-flex size-9 shrink-0 items-center justify-center rounded-xl border shadow-[0_2px_10px_rgba(240,62,62,0.25),inset_0_1px_0_rgba(255,255,255,0.18)] transition-all"
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
                'tactile-press bg-brand border-brand/60 inline-flex size-9 shrink-0 items-center justify-center rounded-xl border font-medium text-white shadow-[0_4px_14px_rgba(255,54,22,0.38),inset_0_1px_0_rgba(255,255,255,0.32),inset_0_-1px_0_rgba(0,0,0,0.35)] transition-all hover:brightness-110',
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
