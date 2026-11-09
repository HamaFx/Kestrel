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

// Full-screen chat shell: top bar, spacious conversation stream, and optional
// right-hand Chart & Plan side panel. Past conversations live in the clean
// top-left Conversation Switcher so the chat stream always has room to breathe.
import type { Symbol } from '@kestrel/shared';
import type { UIMessage } from 'ai';
import { AnimatePresence } from 'motion/react';
import { useEffect, useRef } from 'react';

import { ChatThreadView } from './chat-thread-view';
import { ChatTopBar, type AnalysisMode, type ThreadSummary } from './chat-top-bar';
import { useChatKeyboardShortcuts } from './hooks/use-chat-keyboard-shortcuts';
import { useChatSession } from './hooks/use-chat-session';
import { useChatToolbar } from './hooks/use-chat-toolbar';
import { ThreadViewsDock } from './thread-views-dock';

interface ChatScreenProps {
  threadId: string;
  initialTitle: string;
  initialMessages: UIMessage[];
  initialThreads: ThreadSummary[];
  pinnedSymbol: Symbol | null;
  initialAnalysisMode?: AnalysisMode;
  initialChatModel?: string | null;
  initialShowAgentOpinions?: boolean;
  initialCustomInstructions?: string | null;
  autoSubmitPrompt?: string | null;
}

export function ChatScreen({
  threadId,
  initialTitle,
  initialMessages,
  initialThreads,
  pinnedSymbol,
  initialAnalysisMode = 'single',
  initialChatModel = null,
  initialShowAgentOpinions = true,
  initialCustomInstructions,
  autoSubmitPrompt,
}: ChatScreenProps) {
  const toolbar = useChatToolbar({
    threadId,
    initialAnalysisMode,
    initialChatModel,
    initialShowAgentOpinions,
  });
  const session = useChatSession({
    threadId,
    initialTitle,
    initialMessages,
    autoSubmitPrompt,
    customInstructions: initialCustomInstructions ?? '',
    responseStyle: 'default',
    citeSources: false,
    analysisModeRef: toolbar.analysisModeRef,
  });
  const { splitMode, setSplitMode, dockTab, setDockTab } = toolbar;

  useChatKeyboardShortcuts({ onToggleViews: () => setSplitMode((v) => !v) });

  // On wide screens (>=1280px), auto-open the right panel once a Deep Analysis
  // run is active or armed for this thread.
  const autoOpenedThreadRef = useRef<string | null>(null);
  useEffect(() => {
    if (typeof window === 'undefined' || window.innerWidth < 1280) return;
    if (autoOpenedThreadRef.current === threadId) return;
    const hasDeepAnalysis = toolbar.analysisMode === 'full' || session.agentProgress !== null;
    if (hasDeepAnalysis) {
      autoOpenedThreadRef.current = threadId;
      setSplitMode(true);
    }
  }, [threadId, session.agentProgress, toolbar.analysisMode, setSplitMode]);

  const previousProgressRef = useRef(session.agentProgress);
  useEffect(() => {
    const started = session.agentProgress !== null && previousProgressRef.current === null;
    previousProgressRef.current = session.agentProgress;
    if (started) setDockTab('opinions');
  }, [session.agentProgress, setDockTab]);

  const warRoomOpen = splitMode && dockTab === 'opinions';

  const composerPlaceholder = pinnedSymbol
    ? `Ask a question about ${pinnedSymbol}…`
    : 'Ask about Gold (XAUUSD), EURUSD, BTCUSD…';

  return (
    <div className="bg-bg paint-isolated relative flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden">
      <ChatTopBar
        threadId={threadId}
        title={session.title}
        pinnedSymbol={pinnedSymbol}
        threads={initialThreads}
        isStreaming={session.isStreaming}
        splitMode={splitMode}
        onToggleSplitMode={() => setSplitMode((v) => !v)}
      />

      <div className="flex min-h-0 w-full flex-1 overflow-hidden">
        <ChatThreadView
          threadId={threadId}
          pinnedSymbol={pinnedSymbol}
          splitMode={splitMode}
          warRoomOpen={warRoomOpen}
          messages={session.messages}
          status={session.status}
          isStreaming={session.isStreaming}
          error={session.error}
          dismissedError={session.dismissedError}
          setDismissedError={session.setDismissedError}
          agentProgress={session.agentProgress}
          showAgentOpinions={toolbar.showAgentOpinions}
          lastAssistantId={session.lastAssistantId}
          lastUserTextRef={session.lastUserTextRef}
          analysisMode={toolbar.analysisMode}
          onAnalysisModeChange={toolbar.handleAnalysisModeChange}
          chatModel={toolbar.chatModel}
          onChatModelChange={toolbar.handleChatModelChange}
          modelSelectionPending={toolbar.modelSelectionPending}
          onSubmit={session.handleSubmit}
          onStop={session.handleStop}
          onCopy={session.handleCopy}
          onRegenerate={session.handleRegenerate}
          onEdit={session.handleEdit}
          placeholder={composerPlaceholder}
        />

        <AnimatePresence>
          {splitMode && (
            <ThreadViewsDock
              isOpen={splitMode}
              onClose={() => setSplitMode(false)}
              activeTab={dockTab}
              onTabChange={setDockTab}
              symbol={pinnedSymbol ?? 'XAUUSD'}
              agentProgress={session.agentProgress}
              messages={session.messages}
            />
          )}
        </AnimatePresence>
      </div>

      {session.confirmEl}
    </div>
  );
}
