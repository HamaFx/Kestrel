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
import { IconChartBar, IconNotebook, IconSettings, IconTerminal2 } from '@tabler/icons-react';
import { memo } from 'react';

import type { CustomAgentSummary } from '@/hooks/use-custom-agents';
import { cn } from '@/lib/formatters/cn';

import type { AnalysisMode } from './chat-top-bar';
import { ComposerAttachments } from './composer-attachments';
import { ComposerControls } from './composer-controls';
import { MAX_TEXT_CHARS } from './composer-helpers';
import { ComposerMentionMenu } from './composer-mention-menu';
import { ComposerSlashMenu, type SlashMenuCommand } from './composer-slash-menu';
import { useComposer, type ComposerImage } from './use-composer';

export type { ComposerImage } from './use-composer';

interface ComposerProps {
  onSubmit: (text: string, images: ComposerImage[]) => void;
  onStop?: () => void;
  isStreaming?: boolean;
  disabled?: boolean;
  placeholder?: string;
  analysisMode?: AnalysisMode;
  onAnalysisModeChange?: (mode: AnalysisMode) => void;
  chatModel?: string | null;
  onChatModelChange?: (modelId: string) => void;
  contextUsagePercent?: number;
  customAgents?: readonly CustomAgentSummary[];
  selectedAgentSlug?: string | null;
  onAgentChange?: (slug: string | null) => void;
}

export const Composer = memo(function Composer({
  onSubmit,
  onStop,
  isStreaming,
  disabled,
  placeholder = 'Ask about price action, key levels, or market news…',
  analysisMode,
  onAnalysisModeChange,
  chatModel,
  onChatModelChange,
  contextUsagePercent,
  customAgents = [],
  selectedAgentSlug = null,
  onAgentChange,
}: ComposerProps) {
  const composer = useComposer({ onSubmit, disabled, isStreaming, customAgents });
  const {
    value,
    setValue,
    focused,
    setFocused,
    dragOver,
    setDragOver,
    ref,
    slashActive,
    filteredCommands,
    slashIndex,
    setSlashIndex,
    selectSlashCommand,
    handleSlashKeyDown,
    handleSlashChange,
    mentionAgents,
    activeMentionIndex,
    setMentionIndex,
    insertMention,
    send,
    handlePaste,
    handleDrop,
  } = composer;
  const activeCommandId =
    slashActive && filteredCommands[slashIndex]
      ? `slash-cmd-${filteredCommands[slashIndex].command}`
      : undefined;

  return (
    <div className="message-composer-safe-bottom sticky bottom-0 z-20 mx-auto w-full pb-[max(env(safe-area-inset-bottom),12px)]">
      <form
        className={cn(
          'border-border bg-bg-elev-1 relative z-10 flex w-full flex-col gap-1.5 rounded-xl border p-2.5 shadow-md transition-colors duration-150',
          focused && 'border-fg-subtle/60',
          dragOver && 'border-brand ring-brand/40 ring-2',
        )}
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        <ComposerAttachments composer={composer} />
        <ComposerMentionMenu composer={composer} />

        <ComposerSlashMenu
          active={slashActive && filteredCommands.length > 0}
          commands={filteredCommands as readonly SlashMenuCommand[]}
          allCommands={[
            { command: '/chart', icon: <IconChartBar className="size-4" /> },
            { command: '/journal', icon: <IconNotebook className="size-4" /> },
            { command: '/settings', icon: <IconSettings className="size-4" /> },
            { command: '/analyze', icon: <IconTerminal2 className="size-4" /> },
          ]}
          activeIndex={slashIndex}
          onSelect={selectSlashCommand}
          onHover={setSlashIndex}
        />

        <div className="flex min-h-0 flex-1 flex-col px-2 pt-0.5">
          <textarea
            ref={ref}
            aria-label="Chat message input"
            aria-describedby={composer.error ? 'composer-error' : undefined}
            aria-expanded={slashActive && filteredCommands.length > 0}
            aria-controls="slash-command-listbox"
            aria-activedescendant={activeCommandId}
            value={value}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onPaste={handlePaste}
            rows={1}
            placeholder={placeholder}
            disabled={disabled}
            maxLength={MAX_TEXT_CHARS}
            className={cn(
              // 16px on touch/narrow widths: iOS zooms the whole viewport when a
              // focused field renders below 16px and then leaves the page stuck
              // at that scale. Desktop keeps the designed type size.
              'text-fg placeholder:text-fg-subtle lg:text-body w-full resize-none border-0 bg-transparent p-0 text-[16px] leading-[1.45] shadow-none focus:outline-none focus-visible:ring-0',
              '[field-sizing:content] max-h-[4lh] min-h-[36px] sm:max-h-[10lh]',
            )}
            onKeyDown={(e) => {
              if (mentionAgents.length > 0) {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setMentionIndex((activeMentionIndex + 1) % mentionAgents.length);
                  return;
                }
                if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setMentionIndex(
                    (activeMentionIndex - 1 + mentionAgents.length) % mentionAgents.length,
                  );
                  return;
                }
                if (e.key === 'Enter' || e.key === 'Tab') {
                  const picked = mentionAgents[activeMentionIndex];
                  if (picked) {
                    e.preventDefault();
                    insertMention(picked.slug);
                    return;
                  }
                }
                if (e.key === 'Escape') {
                  e.preventDefault();
                  setValue('');
                  return;
                }
              }
              if (handleSlashKeyDown(e)) return;
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            onChange={(e) => {
              setMentionIndex(0);
              handleSlashChange(e.target.value);
            }}
          />
        </div>

        <ComposerControls
          composer={composer}
          analysisMode={analysisMode}
          onAnalysisModeChange={onAnalysisModeChange}
          chatModel={chatModel}
          onChatModelChange={onChatModelChange}
          customAgents={customAgents}
          selectedAgentSlug={selectedAgentSlug}
          onAgentChange={onAgentChange}
          disabled={disabled}
          isStreaming={isStreaming}
          onStop={onStop}
          contextUsagePercent={contextUsagePercent}
        />
      </form>
    </div>
  );
});
