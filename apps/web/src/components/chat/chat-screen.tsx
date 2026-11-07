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
import { useEffect, useRef } from 'react';

import { useLocalStorage } from '@/hooks/use-local-storage';

import { ChatThreadView } from './chat-thread-view';
import { ChatTopBar, type AnalysisMode, type ThreadSummary } from './chat-top-bar';
import { useChatKeyboardShortcuts } from './hooks/use-chat-keyboard-shortcuts';
import { useChatSession } from './hooks/use-chat-session';
import { useChatToolbar } from './hooks/use-chat-toolbar';
import { ThreadLedgerRail } from './thread-ledger-rail';
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
  const [railOpen, setRailOpen, railHydrated] = useLocalStorage<boolean>(
    'kestrel:chat-thread-rail:v1',
    false,
  );

  // Default the ledger rail open only on >=1440px viewports, and only when the
  // operator has not explicitly collapsed or opened it before.
  useEffect(() => {
    if (!railHydrated || typeof window === 'undefined' || window.innerWidth < 1440) return;
    try {
      if (window.localStorage.getItem('kestrel:chat-thread-rail:v1') === null) setRailOpen(true);
    } catch {
      // Storage may be unavailable in restricted privacy contexts
    }
  }, [railHydrated, setRailOpen]);

  useChatKeyboardShortcuts({ onToggleViews: () => setSplitMode((v) => !v) });

  // Wide-screen default auto-open (Task 4.3): on >=1280px (xl:), auto-open the
  // views dock once a Council context exists (`Convene Council` armed or a
  // committee run in flight) — never for a casual Fast Scout message. Guarded
  // by a per-thread ref: the old unconditional effect re-opened the dock the
  // instant the user closed it (closing flips `splitMode`, which re-ran the
  // effect and saw messages), so the sidecar could never be dismissed on xl
  // screens. Below `xl` the sidecar must never auto-open (review focus 4).
  const autoOpenedThreadRef = useRef<string | null>(null);
  useEffect(() => {
    if (typeof window === 'undefined' || window.innerWidth < 1280) return;
    if (autoOpenedThreadRef.current === threadId) return;
    const hasCouncilContext = toolbar.analysisMode === 'full' || session.agentProgress !== null;
    if (hasCouncilContext) {
      autoOpenedThreadRef.current = threadId;
      setSplitMode(true);
    }
  }, [threadId, session.agentProgress, toolbar.analysisMode, setSplitMode]);

  // When a Council run actually starts, surface the War Room tab so the live
  // Circuit Spine is where the user is already looking.
  const previousProgressRef = useRef(session.agentProgress);
  useEffect(() => {
    const started = session.agentProgress !== null && previousProgressRef.current === null;
    previousProgressRef.current = session.agentProgress;
    if (started) setDockTab('opinions');
  }, [session.agentProgress, setDockTab]);

  const warRoomOpen = splitMode && dockTab === 'opinions';

  const composerPlaceholder = pinnedSymbol
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
        splitMode={splitMode}
        onToggleSplitMode={() => setSplitMode((v) => !v)}
        railOpen={railOpen}
        onToggleRail={() => setRailOpen((v) => !v)}
      />

      <div className="flex min-h-0 w-full flex-1 overflow-hidden">
        {railOpen ? (
          <ThreadLedgerRail
            threads={initialThreads}
            threadId={threadId}
            onCollapse={() => setRailOpen(false)}
          />
        ) : null}

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
