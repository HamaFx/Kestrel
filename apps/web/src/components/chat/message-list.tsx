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

// Message scroll body. Virtualized using @tanstack/react-virtual to handle
// large threads efficiently, rendering only the visible messages in the DOM.
import { useVirtualizer } from '@tanstack/react-virtual';
import type { UIMessage } from 'ai';
import { memo, useEffect, useMemo, useRef, useState, type RefObject } from 'react';

import type { AgentProgress } from '@/lib/chat-transport';

import { Message } from './message';
import { AgentDeliberation } from './parts/agent-deliberation';
import { PixelDeskThinking } from './parts/pixel-desk/pixel-desk';

function StreamingLiveRegion({ text }: { text: string }) {
  const [debouncedText, setDebouncedText] = useState(text);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedText(text), 1000);
    return () => clearTimeout(timer);
  }, [text]);

  return (
    <div role="status" aria-live="polite" className="sr-only">
      {debouncedText}
    </div>
  );
}

interface MessageListProps {
  threadId: string;
  messages: UIMessage[];
  isStreaming?: boolean;
  showTypingIndicator?: boolean;
  agentProgress?: AgentProgress | null;
  scrollElement?: HTMLDivElement | null;
  /** Index of the last assistant message — gets the regenerate affordance. */
  lastAssistantId?: string;
  onCopy?: (text: string) => void;
  onRegenerate?: (opts?: { modelOverride?: string }) => void;
  onEdit?: (messageId: string, newText: string) => void;
  onFollowUpSelect?: (prompt: string) => void;
  /**
   * Populated with a `scrollToIndex` function so parents (e.g. the TOC rail)
   * can jump to rows that are not mounted — the virtualizer only renders the
   * visible window plus overscan, so DOM queries cannot reach distant rows.
   */
  scrollToIndexRef?: RefObject<((index: number) => void) | null>;
}

export const MessageList = memo(function MessageList({
  threadId,
  messages,
  isStreaming,
  showTypingIndicator,
  agentProgress,
  scrollElement,
  lastAssistantId,
  onCopy,
  onRegenerate,
  onEdit,
  onFollowUpSelect,
  scrollToIndexRef,
}: MessageListProps) {
  const hasLiveDeliberation = Boolean(
    agentProgress && Array.isArray(agentProgress.agents) && agentProgress.agents.length > 0,
  );
  const showFooterRow = Boolean(showTypingIndicator || hasLiveDeliberation);
  const count = messages.length + (showFooterRow ? 1 : 0);

  const rowVirtualizer = useVirtualizer({
    count,
    getScrollElement: () => scrollElement ?? null,
    estimateSize: (index) => {
      const msg = messages[index];
      if (!msg) return 180;
      const hasToolCall = msg.parts?.some((p) => p.type.startsWith('tool-'));
      const hasMarkdown = msg.parts?.some((p) => p.type === 'text' && p.text.length > 500);
      const hasTables = msg.parts?.some((p) => p.type === 'text' && /\|.*\|/.test(p.text));
      if (hasToolCall) return 500;
      if (hasTables) return 400;
      if (hasMarkdown) return 300;
      if (msg.role === 'user') return 80;
      return 180;
    },
    overscan: 5,
  });

  const containerRef = useRef<HTMLDivElement>(null);
  const totalSize = rowVirtualizer.getTotalSize();

  // Single virtualization/scroll effect:
  // - keep the container tall enough for the full virtual window, and
  // - expose `scrollToIndex` to the parent (TOC rail) so "jump to turn"
  //   works for rows the virtualizer has not mounted.
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.style.height = `${totalSize}px`;
    }
    if (!scrollToIndexRef) return;
    scrollToIndexRef.current = (index: number) => {
      rowVirtualizer.scrollToIndex(index, { align: 'start' });
    };
    return () => {
      scrollToIndexRef.current = null;
    };
  }, [scrollToIndexRef, rowVirtualizer, totalSize]);

  // Single live region for active streaming output (last assistant message only)
  const streamingText = useMemo(() => {
    if (!isStreaming || !lastAssistantId) return '';
    const lastMsg = messages.find((m) => m.id === lastAssistantId);
    if (!lastMsg || lastMsg.role !== 'assistant') return '';
    return (
      lastMsg.parts
        ?.filter((p) => p.type === 'text')
        .map((p) => ('text' in p ? p.text : ''))
        .join('') ?? ''
    );
  }, [isStreaming, lastAssistantId, messages]);

  return (
    <div
      ref={containerRef}
      className="relative w-full px-4 py-4"
      style={{
        height: `${totalSize}px`,
      }}
    >
      {isStreaming && streamingText ? <StreamingLiveRegion text={streamingText} /> : null}
      {rowVirtualizer.getVirtualItems().map((virtualRow) => {
        const isFooterRow = virtualRow.index === messages.length;

        if (isFooterRow) {
          return (
            <div
              key={virtualRow.key}
              data-index={virtualRow.index}
              ref={rowVirtualizer.measureElement}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: 'calc(100% - 2rem)',
                transform: `translateY(${virtualRow.start}px)`,
              }}
              className="py-2"
            >
              <div className="flex w-full justify-start">
                {hasLiveDeliberation && agentProgress ? (
                  <div className="w-full max-w-2xl">
                    <AgentDeliberation
                      agents={agentProgress.agents}
                      mode={agentProgress.mode}
                      status={agentProgress.status}
                      error={agentProgress.error}
                      {...(agentProgress.comparisonSymbols
                        ? { comparisonSymbols: agentProgress.comparisonSymbols }
                        : {})}
                    />
                  </div>
                ) : (
                  <PixelDeskThinking agentProgress={agentProgress} />
                )}
              </div>
            </div>
          );
        }

        const m = messages[virtualRow.index];
        if (!m) return null;

        const isLastAssistant = m.id === lastAssistantId;
        const isRowStreaming = Boolean(isStreaming && isLastAssistant);

        return (
          <div
            key={virtualRow.key}
            data-index={virtualRow.index}
            ref={rowVirtualizer.measureElement}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: 'calc(100% - 2rem)',
              transform: `translateY(${virtualRow.start}px)`,
            }}
          >
            <Message
              threadId={threadId}
              message={m}
              isStreaming={isRowStreaming}
              isLastAssistant={isLastAssistant}
              onCopy={onCopy}
              onRegenerate={
                onRegenerate && isLastAssistant && !isStreaming ? onRegenerate : undefined
              }
              onEdit={onEdit}
              onFollowUpSelect={onFollowUpSelect}
            />
          </div>
        );
      })}
    </div>
  );
});
