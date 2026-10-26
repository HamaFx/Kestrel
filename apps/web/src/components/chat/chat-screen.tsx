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

// Full-screen chat shell: top bar, thread pane, and the optional sidecar.
// Session state lives in `hooks/use-chat-*`; the thread pane owns scrolling.
import type { Symbol } from '@kestrel/shared';
import type { UIMessage } from 'ai';
import { AnimatePresence } from 'motion/react';
import { useEffect } from 'react';

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
  initialAgentSlug?: string | null;
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
  initialAgentSlug = null,
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
    initialAgentSlug,
    autoSubmitPrompt,
    customInstructions: initialCustomInstructions ?? '',
    responseStyle: 'default',
    citeSources: false,
    analysisModeRef: toolbar.analysisModeRef,
  });
  const { splitMode, setSplitMode, dockTab, setDockTab } = toolbar;

  useChatKeyboardShortcuts({ onToggleViews: () => setSplitMode((v) => !v) });

  // Wide-screen default auto-open (Task 4.3): on >=1280px (xl:), auto-open views if content exists
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.innerWidth >= 1280) {
      const hasActiveContext =
        session.messages.length > 0 ||
        session.agentProgress !== null ||
        toolbar.analysisMode === 'full';
      if (hasActiveContext && !splitMode) {
        setSplitMode(true);
      }
    }
  }, [session.messages.length, session.agentProgress, toolbar.analysisMode, splitMode, setSplitMode]);

  const composerPlaceholder = session.selectedAgentSlug
    ? `Ask @${session.selectedAgentSlug}…`
    : session.customAgents.length > 0
      ? 'Ask about XAU… or type @ to pick an agent'
      : pinnedSymbol
        ? `Ask about ${pinnedSymbol}…`
        : 'Ask about XAU, EUR, GBP…';

  return (
    <div className="bg-bg paint-isolated relative flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden">
      <ChatTopBar
        threadId={threadId}
        title={session.title}
        pinnedSymbol={pinnedSymbol}
        threads={initialThreads}
        isStreaming={session.isStreaming}
        analysisMode={toolbar.analysisMode}
        onAnalysisModeChange={toolbar.handleAnalysisModeChange}
        chatModel={toolbar.chatModel}
        onChatModelChange={toolbar.handleChatModelChange}
        modelSelectionPending={toolbar.modelSelectionPending}
        viewsOpen={splitMode}
        onToggleViews={() => setSplitMode((v) => !v)}
        splitMode={splitMode}
        onToggleSplitMode={() => setSplitMode((v) => !v)}
        activeAgent={session.selectedAgent}
      />

      <div className="flex min-h-0 w-full flex-1 overflow-hidden">
        <ChatThreadView
          threadId={threadId}
          pinnedSymbol={pinnedSymbol}
          splitMode={splitMode}
          messages={session.messages}
          status={session.status}
          isStreaming={session.isStreaming}
          error={session.error}
          dismissedError={session.dismissedError}
          setDismissedError={session.setDismissedError}
          summary={session.summary}
          setSummary={session.setSummary}
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
          customAgents={session.customAgents}
          selectedAgentSlug={session.selectedAgentSlug}
          onAgentChange={session.setSelectedAgentSlug}
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
