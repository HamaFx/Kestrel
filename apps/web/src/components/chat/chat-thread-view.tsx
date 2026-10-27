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

// Scrollable thread pane + composer. Owns only scroll state; session state is
// passed in from `chat-screen.tsx`.
import { IconArrowBackUp, IconArrowDown, IconX } from '@tabler/icons-react';
import { AnimatePresence, m } from 'motion/react';
import { useCallback, useRef, useState } from 'react';

import { useAutoScroll } from '@/hooks/use-auto-scroll';
import { chatErrorText } from '@/lib/chat-transport';
import { cn } from '@/lib/formatters/cn';

import { ThreadSummaryHeader } from './_components/thread-summary-header';
import { ChatComposerDock } from './chat-composer-dock';
import { ChatEmptyState } from './chat-empty-state';
import type { ChatThreadViewProps } from './chat-thread-view-types';
import { MessageList } from './message-list';
import { ThreadTocRail } from './thread-toc-rail';

export function ChatThreadView({
  threadId,
  pinnedSymbol,
  splitMode,
  warRoomOpen,
  messages,
  status,
  isStreaming,
  error,
  dismissedError,
  setDismissedError,
  summary,
  setSummary,
  agentProgress,
  showAgentOpinions,
  lastAssistantId,
  lastUserTextRef,
  analysisMode,
  onAnalysisModeChange,
  chatModel,
  onChatModelChange,
  modelSelectionPending,
  onSubmit,
  onStop,
  onCopy,
  onRegenerate,
  onEdit,
  placeholder,
  customAgents,
  selectedAgentSlug,
  onAgentChange,
}: ChatThreadViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollToMessageIndexRef = useRef<((index: number) => void) | null>(null);
  const [scrollElement, setScrollElement] = useState<HTMLDivElement | null>(null);

  const setScrollContainer = useCallback((element: HTMLDivElement | null) => {
    scrollRef.current = element;
    setScrollElement(element);
  }, []);

  const { showScrollFab, scrollToBottom } = useAutoScroll({
    scrollRef,
    scrollElement,
    dependency: messages,
    resetKey: threadId,
    isStreaming,
  });

  return (
    <div className="relative flex h-full min-w-0 flex-1 flex-col overflow-hidden">
      <div
        ref={setScrollContainer}
        className="scrollbar-hide no-overscroll relative flex-1 overflow-y-auto"
      >
        <div
          className={cn(
            'mx-auto px-4 py-4',
            splitMode ? 'w-full max-w-2xl xl:max-w-3xl' : 'max-w-3xl xl:max-w-4xl',
          )}
        >
          {summary ? (
            <div className="px-3 pt-2">
              <ThreadSummaryHeader
                synopsis={summary.synopsis}
                insights={summary.insights}
                onDismiss={() => setSummary(null)}
              />
            </div>
          ) : null}

          {messages.length === 0 ? (
            <ChatEmptyState
              pinnedSymbol={pinnedSymbol}
              disabled={isStreaming}
              onSelect={(text, modeOverride) => {
                if (modeOverride && modeOverride !== analysisMode) {
                  onAnalysisModeChange(modeOverride);
                }
                lastUserTextRef.current = text;
                onSubmit(text, []);
              }}
            />
          ) : (
            <MessageList
              threadId={threadId}
              messages={messages}
              warRoomOpen={warRoomOpen}
              isStreaming={isStreaming}
              showTypingIndicator={status === 'submitted'}
              agentProgress={showAgentOpinions ? agentProgress : null}
              analysisMode={analysisMode}
              scrollElement={scrollElement}
              lastAssistantId={lastAssistantId}
              onCopy={onCopy}
              onRegenerate={onRegenerate}
              onEdit={onEdit}
              onFollowUpSelect={(text) => {
                lastUserTextRef.current = text;
                onSubmit(text, []);
              }}
              scrollToIndexRef={scrollToMessageIndexRef}
            />
          )}

          <AnimatePresence>
            {error && !dismissedError ? (
              <m.div
                key="chat-error"
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                role="alert"
                className="bg-danger/10 text-danger border-danger/30 mx-3 mb-2 flex items-center justify-between gap-2 rounded-lg border p-3 text-xs"
              >
                <span className="line-clamp-2 flex-1">{chatErrorText(error)}</span>
                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      if (lastUserTextRef.current) onSubmit(lastUserTextRef.current, []);
                    }}
                    aria-label="Retry"
                    className="bg-danger/20 hover:bg-danger/30 border-danger/30 text-body-sm inline-flex items-center gap-1 rounded-sm border px-3 py-1.5 font-medium"
                  >
                    <IconArrowBackUp className="size-3.5" /> Retry
                  </button>
                  <button
                    type="button"
                    onClick={() => setDismissedError(true)}
                    aria-label="Dismiss error"
                    className="hover:bg-danger/10 text-danger/80 hover:text-danger inline-flex size-7 items-center justify-center rounded-sm transition-colors"
                  >
                    <IconX className="size-4" />
                  </button>
                </div>
              </m.div>
            ) : null}
          </AnimatePresence>
        </div>

        <AnimatePresence>
          {showScrollFab && (
            <m.button
              key="scroll-fab"
              type="button"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              transition={{ duration: 0.2 }}
              onClick={scrollToBottom}
              aria-label="Scroll to latest"
              className="scroll-fab surface-elevated text-fg text-body-sm absolute left-1/2 z-30 inline-flex h-10 -translate-x-1/2 items-center gap-1.5 rounded-full px-4 font-medium transition-all"
              style={{ bottom: 'calc(env(safe-area-inset-bottom) + 92px)' }}
            >
              <IconArrowDown className="size-3.5" />
              Latest
            </m.button>
          )}
        </AnimatePresence>

        {!splitMode && (
          <ThreadTocRail
            messages={messages}
            onScrollToTurn={(idx) => {
              if (scrollToMessageIndexRef.current) {
                scrollToMessageIndexRef.current(idx);
                return;
              }
              const target = scrollElement?.querySelector(`[data-index="${idx}"]`);
              if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }}
          />
        )}
      </div>

      <ChatComposerDock
        splitMode={splitMode}
        analysisMode={analysisMode}
        onAnalysisModeChange={onAnalysisModeChange}
        chatModel={chatModel}
        onChatModelChange={onChatModelChange}
        onSubmit={onSubmit}
        onStop={onStop}
        isStreaming={isStreaming}
        modelSelectionPending={modelSelectionPending}
        placeholder={placeholder}
        customAgents={customAgents}
        selectedAgentSlug={selectedAgentSlug}
        onAgentChange={onAgentChange}
      />
    </div>
  );
}
