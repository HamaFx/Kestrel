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

// Full-screen chat experience.
import { useChat } from '@ai-sdk/react';
import type { Symbol, Timeframe } from '@kestrel/shared';
import { IconArrowBackUp, IconArrowDown, IconX } from '@tabler/icons-react';
import type { UIMessage } from 'ai';
import { AnimatePresence, m } from 'motion/react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import { useSidebarState } from '@/components/layout/sidebar-state-context';
import { useConfirm } from '@/components/ui/confirm-drawer';
import { useAutoScroll } from '@/hooks/use-auto-scroll';
import { useThreadTitle } from '@/hooks/use-thread-title';
import { useWebappShortcuts } from '@/hooks/use-webapp-shortcuts';
import { apiFetch, apiMutate } from '@/lib/api-client';
import {
  chatErrorText,
  createKestrelChatTransport,
  type AgentProgress,
} from '@/lib/chat-transport';
import { cn } from '@/lib/cn';
import { getCsrfToken } from '@/lib/csrf';

import { ThreadSummaryHeader } from './_components/thread-summary-header';
import { ChatTopBar, type AnalysisMode, type ThreadSummary } from './chat-top-bar';
import { Composer } from './composer';
import { MessageList } from './message-list';
import { PixelDeskStandby } from './parts/pixel-desk/pixel-desk';
import { ThreadTocRail } from './thread-toc-rail';
import { ThreadViewsDock, type DockTab } from './thread-views-dock';

interface ChatScreenProps {
  threadId: string;
  initialTitle: string;
  initialMessages: UIMessage[];
  initialThreads: ThreadSummary[];
  pinnedSymbol: Symbol | null;
  /** Default analysis mode loaded from the user's server-side settings. */
  initialAnalysisMode?: AnalysisMode;
  /** Saved chat model in `provider:model` format, or null for resolver default. */
  initialChatModel?: string | null;
  /** Whether the completed committee opinions should remain visible. */
  initialShowAgentOpinions?: boolean;
  /** Server-side AI custom instructions. */
  initialCustomInstructions?: string | null;
  /** Optional prompt to auto-submit on mount. */
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
  const { collapsed } = useSidebarState();
  const lastUserTextRef = useRef<string>('');
  const autoSubmittedRef = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollElement, setScrollElement] = useState<HTMLDivElement | null>(null);
  const router = useRouter();
  const [analysisMode, setAnalysisMode] = useState<AnalysisMode>(initialAnalysisMode);
  const analysisModeRef = useRef<AnalysisMode>(initialAnalysisMode);
  const [showAgentOpinions] = useState(initialShowAgentOpinions);
  const [chatModel, setChatModel] = useState<string | null>(initialChatModel);
  const chatModelRef = useRef<string | null>(initialChatModel);
  const [modelSelectionPending, setModelSelectionPending] = useState(false);

  // One-shot model override.
  const modelOverrideRef = useRef<string | null>(null);

  const [dismissedError, setDismissedError] = useState(false);
  const [agentProgress, setAgentProgress] = useState<AgentProgress | null>(null);
  const [confirmEl, confirm] = useConfirm();

  const customInstructions = initialCustomInstructions ?? '';
  const responseStyle: 'default' | 'concise' | 'technical' | 'risk-first' = 'default';
  const citeSources = false;

  const [summary, setSummary] = useState<{
    synopsis: string;
    insights: Array<{ text: string; symbol?: string | null }>;
  } | null>(null);

  const [splitMode, setSplitMode] = useState(false);
  const [splitTf, setSplitTf] = useState<Timeframe>('15m');
  const [dockTab, setDockTab] = useState<DockTab>('chart');
  const activeChartSymbol = pinnedSymbol ?? 'XAUUSD';

  useWebappShortcuts({
    onFocusComposer: () => {
      const textarea = document.querySelector<HTMLTextAreaElement>(
        'textarea[aria-label="Chat message input"]',
      );
      textarea?.focus();
    },
    onToggleViews: () => {
      setSplitMode((v) => !v);
    },
  });

  const onAgentProgressRef = useRef<(progress: AgentProgress | null) => void>(() => {});
  const singleTurnOverrideRef = useRef<'single' | null>(null);

  const transport = useMemo(
    () =>
      createKestrelChatTransport({
        api: '/api/chat',
        prepareSendMessagesRequest: ({ messages, id, body }) => {
          const override = modelOverrideRef.current;
          const singleTurnOverride = singleTurnOverrideRef.current;
          singleTurnOverrideRef.current = null;
          const csrf = getCsrfToken();
          const prefs = { customInstructions, responseStyle, citeSources };
          const prefsJson = customInstructions ? JSON.stringify(prefs) : null;

          const reqBody = {
            ...body,
            modelOverride: override ?? undefined,
            analysisMode: singleTurnOverride ?? analysisModeRef.current,
            threadId,
            id,
            messages,
          };

          const headers: Record<string, string> = {};
          if (csrf) headers['X-CSRF-Token'] = csrf;
          if (prefsJson) headers['X-AI-Prefs'] = prefsJson;

          return Object.keys(headers).length > 0 ? { headers, body: reqBody } : { body: reqBody };
        },
        onAgentProgress: (p) => onAgentProgressRef.current(p),
      }),
    [threadId, customInstructions, responseStyle, citeSources],
  );

  useEffect(() => {
    onAgentProgressRef.current = (p) => setAgentProgress(p);
  });

  useEffect(() => {
    if (!showAgentOpinions) {
      setAgentProgress(null);
    }
  }, [showAgentOpinions]);

  const { messages, setMessages, sendMessage, regenerate, stop, status, error } = useChat({
    id: threadId,
    transport,
    messages: initialMessages,
  });

  const { title } = useThreadTitle({
    threadId,
    initialTitle,
    status,
    messageCount: messages.length,
  });

  const messagesRef = useRef(messages);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    if (messages.length > 20 && !summary) {
      const ac = new AbortController();
      apiFetch<{ synopsis: string; insights: Array<{ text: string; symbol?: string | null }> }>(
        `/api/chat/threads/${threadId}/summary`,
        { signal: ac.signal },
      )
        .then((data) => {
          if (data && typeof data.synopsis === 'string') setSummary(data);
        })
        .catch((err) => {
          if (err instanceof DOMException && err.name === 'AbortError') return;
        });
      return () => ac.abort();
    }
  }, [messages.length, threadId, summary]);

  const isStreaming = useMemo(() => status === 'submitted' || status === 'streaming', [status]);

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

  useEffect(() => {
    if (!autoSubmitPrompt) return;
    if (autoSubmittedRef.current === threadId) return;
    if (messages.length > 0) return;
    if (isStreaming) return;
    autoSubmittedRef.current = threadId;
    lastUserTextRef.current = autoSubmitPrompt;
    void sendMessage({ text: autoSubmitPrompt });
  }, [autoSubmitPrompt, threadId, messages.length, isStreaming, sendMessage]);

  useEffect(() => {
    if (status === 'ready' || (error && status === 'error')) {
      modelOverrideRef.current = null;
      singleTurnOverrideRef.current = null;
    }
  }, [status, error]);

  useEffect(() => {
    if (isStreaming) {
      setDismissedError(false);
    }
  }, [isStreaming]);

  const handleCopy = useCallback((text: string) => {
    void navigator.clipboard.writeText(text);
    toast.success('Copied');
  }, []);

  const handleRegenerate = useCallback(
    (opts?: { modelOverride?: string }) => {
      if (opts?.modelOverride) modelOverrideRef.current = opts.modelOverride;
      void regenerate();
    },
    [regenerate],
  );

  const handleChatModelChange = useCallback((nextModel: string) => {
    const separator = nextModel.indexOf(':');
    if (separator <= 0 || separator === nextModel.length - 1) {
      toast.error('Invalid model selection', {
        description: 'Please choose a model from the catalog.',
      });
      return;
    }

    const previousModel = chatModelRef.current;
    chatModelRef.current = nextModel;
    setChatModel(nextModel);
    setModelSelectionPending(true);

    void apiMutate<{ ok: true; chatModel: string }>('/api/settings/chat-model', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        providerId: nextModel.slice(0, separator),
        modelId: nextModel.slice(separator + 1),
      }),
    })
      .then((data) => {
        const savedModel = data.chatModel || nextModel;
        chatModelRef.current = savedModel;
        setChatModel(savedModel);
        toast.success('Chat model updated');
      })
      .catch((err) => {
        chatModelRef.current = previousModel;
        setChatModel(previousModel);
        toast.error('Could not save chat model', {
          description: err instanceof Error ? err.message : 'Please try again.',
        });
      })
      .finally(() => setModelSelectionPending(false));
  }, []);

  const handleAnalysisModeChange = useCallback(
    (nextMode: AnalysisMode) => {
      const previousMode = analysisModeRef.current;
      analysisModeRef.current = nextMode;
      setAnalysisMode(nextMode);
      void apiMutate(`/api/chat/threads/${threadId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ analysisMode: nextMode }),
      }).catch((err) => {
        analysisModeRef.current = previousMode;
        setAnalysisMode(previousMode);
        toast.error('Could not save analysis mode', {
          description: err instanceof Error ? err.message : 'Please try again.',
        });
      });
    },
    [threadId],
  );

  const handleEdit = useCallback(
    async (messageId: string, newText: string) => {
      const cur = messagesRef.current;
      const idx = cur.findIndex((m) => m.id === messageId);
      if (idx === -1) return;
      const isLastMessage = idx === cur.length - 1;
      if (!isLastMessage) {
        const ok = await confirm({
          title: 'Edit earlier message?',
          description:
            'Editing this message will create a new thread branch. The current thread will be preserved.',
          confirmLabel: 'Create branch',
          tone: 'default',
        });
        if (!ok) return;
        try {
          const { threadId: newThreadId } = await apiMutate<{ threadId: string }>(
            '/api/chat/threads/fork',
            {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({
                sourceThreadId: threadId,
                atMessageId: messageId,
                newText,
              }),
            },
          );
          toast.success('Forked into a new thread');
          router.refresh();
          router.push(`/chat/${newThreadId}`);
        } catch (err) {
          toast.error(err instanceof Error ? err.message : 'Could not fork thread');
        }
        return;
      }
      const sliced = cur.slice(0, idx);
      setMessages(sliced);
      void sendMessage({ text: newText });
    },
    [threadId, router, sendMessage, setMessages, confirm],
  );

  const isEmpty = messages.length === 0;

  const lastAssistantId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const m = messages[i];
      if (m && m.role === 'assistant') return m.id;
    }
    return undefined;
  }, [messages]);

  return (
    <div
      className={cn(
        'bg-bg paint-isolated fixed inset-0 z-30 flex flex-col transition-[left] duration-200 ease-in-out',
        collapsed ? 'lg:left-16' : 'lg:left-56',
      )}
    >
      <ChatTopBar
        threadId={threadId}
        title={title}
        pinnedSymbol={pinnedSymbol}
        threads={initialThreads}
        isStreaming={isStreaming}
        analysisMode={analysisMode}
        onAnalysisModeChange={handleAnalysisModeChange}
        chatModel={chatModel}
        onChatModelChange={handleChatModelChange}
        modelSelectionPending={modelSelectionPending}
        viewsOpen={splitMode}
        onToggleViews={() => setSplitMode((v) => !v)}
        splitMode={splitMode}
        onToggleSplitMode={() => setSplitMode((v) => !v)}
      />

      <div className="flex min-h-0 w-full flex-1 overflow-hidden">
        {/* Main Chat View */}
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

              {isEmpty ? (
                <EmptyChatState
                  pinnedSymbol={pinnedSymbol}
                  disabled={isStreaming}
                  onSelect={(text) => {
                    lastUserTextRef.current = text;
                    void sendMessage({ text });
                  }}
                />
              ) : (
                <MessageList
                  threadId={threadId}
                  messages={messages}
                  isStreaming={isStreaming}
                  showTypingIndicator={status === 'submitted'}
                  agentProgress={showAgentOpinions ? agentProgress : null}
                  scrollElement={scrollElement}
                  lastAssistantId={lastAssistantId}
                  onCopy={handleCopy}
                  onRegenerate={handleRegenerate}
                  onEdit={handleEdit}
                  onFollowUpSelect={(text) => {
                    lastUserTextRef.current = text;
                    void sendMessage({ text });
                  }}
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
                    className={cn(
                      'bg-danger/10 text-danger border-danger/30 mx-3 mb-2 flex items-center justify-between gap-2 rounded-lg border p-3 text-xs',
                    )}
                  >
                    <span className="line-clamp-2 flex-1">{chatErrorText(error)}</span>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          if (lastUserTextRef.current) {
                            void sendMessage({ text: lastUserTextRef.current });
                          }
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
                  const target = scrollElement?.querySelector(`[data-index="${idx}"]`);
                  if (target) {
                    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }
                }}
              />
            )}
          </div>

          <div
            className={cn(
              'mx-auto flex w-full flex-col px-4 pt-1',
              splitMode ? 'w-full max-w-2xl xl:max-w-3xl' : 'max-w-3xl xl:max-w-4xl',
            )}
          >
            <Composer
              analysisMode={analysisMode}
              onAnalysisModeChange={handleAnalysisModeChange}
              chatModel={chatModel}
              onChatModelChange={handleChatModelChange}
              onSubmit={(text, images) => {
                lastUserTextRef.current = text;
                if (analysisMode !== 'single' && images.length > 0) {
                  toast('Chart image analysis runs in Quick Read mode for this message.');
                  singleTurnOverrideRef.current = 'single';
                }
                if (images.length === 0) {
                  void sendMessage({ text });
                } else {
                  void sendMessage({
                    text,
                    files: images.map((img) => ({
                      type: 'file' as const,
                      mediaType: img.mediaType,
                      url: img.url,
                      filename: img.name,
                    })),
                  });
                }
              }}
              onStop={() => {
                stop();
              }}
              isStreaming={isStreaming}
              disabled={isStreaming || modelSelectionPending}
              placeholder={
                pinnedSymbol ? `Ask about ${pinnedSymbol}…` : 'Ask about XAU, EUR, GBP…'
              }
            />
          </div>
        </div>

        {/* Docked Sidecar Workspace */}
        <AnimatePresence>
          {splitMode && (
            <ThreadViewsDock
              isOpen={splitMode}
              onClose={() => setSplitMode(false)}
              activeTab={dockTab}
              onTabChange={setDockTab}
              symbol={activeChartSymbol}
              timeframe={splitTf}
              onTimeframeChange={setSplitTf}
              agentProgress={agentProgress}
              messages={messages}
            />
          )}
        </AnimatePresence>
      </div>

      {confirmEl}
    </div>
  );
}

// ---------------------------------------------------------------------------

interface EmptyChatStateProps {
  pinnedSymbol: Symbol | null;
  disabled?: boolean;
  onSelect: (text: string) => void;
}

function EmptyChatState({ pinnedSymbol, disabled, onSelect }: EmptyChatStateProps) {
  return (
    <div className="flex min-h-[64svh] flex-col items-center justify-center gap-5 px-2 py-6">
      <div className="flex w-full max-w-2xl flex-col items-start gap-1 text-left">
        <h2 className="text-fg font-display text-lg font-semibold tracking-tight sm:text-xl">
          Market Research & Committee Desk
        </h2>
        <p className="text-fg-muted text-xs sm:text-sm">
          Select an instrument to run a 4-desk consensus review or ask a direct question below.
        </p>
      </div>

      <div className="flex w-full max-w-2xl justify-center">
        <PixelDeskStandby
          pinnedSymbol={pinnedSymbol}
          onSelectPrompt={onSelect}
          disabled={disabled}
        />
      </div>
    </div>
  );
}
