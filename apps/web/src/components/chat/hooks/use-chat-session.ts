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

// Chat session: useChat transport, standalone-agent selection, auto-submit,
// summary, error/progress state, and message edit/fork.
import { useChat } from '@ai-sdk/react';
import type { UIMessage } from 'ai';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import { useConfirm } from '@/components/ui/confirm-drawer';
import { useCustomAgents } from '@/hooks/use-custom-agents';
import { useThreadTitle } from '@/hooks/use-thread-title';
import { getCsrfToken } from '@/lib/auth/csrf';
import {
  chatErrorText,
  createKestrelChatTransport,
  type AgentProgress,
} from '@/lib/chat-transport';
import { apiMutate } from '@/lib/http/api-client';

import type { ComposerImage } from '../composer';
import { useChatUrlSync } from './use-chat-url-sync';

export function useChatSession({
  threadId,
  initialTitle,
  initialMessages,
  initialAgentSlug,
  autoSubmitPrompt,
  customInstructions,
  responseStyle,
  citeSources,
  analysisModeRef,
}: {
  threadId: string;
  initialTitle: string;
  initialMessages: UIMessage[];
  initialAgentSlug: string | null;
  autoSubmitPrompt: string | null | undefined;
  customInstructions: string;
  responseStyle: 'default' | 'concise' | 'technical' | 'risk-first';
  citeSources: boolean;
  analysisModeRef: { current: 'single' | 'full' };
}) {
  const { agents: customAgents, loading: customAgentsLoading } = useCustomAgents();
  const [selectedAgentSlug, setSelectedAgentSlug] = useState<string | null>(initialAgentSlug);
  const selectedAgent = selectedAgentSlug
    ? (customAgents.find((agent) => agent.slug === selectedAgentSlug) ?? null)
    : null;
  const lastUserTextRef = useRef<string>('');
  const autoSubmittedRef = useRef<string | null>(null);
  const router = useRouter();
  const [dismissedError, setDismissedError] = useState(false);
  const [agentProgress, setAgentProgress] = useState<AgentProgress | null>(null);
  const [confirmEl, confirm] = useConfirm();
  const modelOverrideRef = useRef<string | null>(null);
  const singleTurnOverrideRef = useRef<'single' | null>(null);

  useEffect(() => {
    setSelectedAgentSlug(initialAgentSlug);
  }, [initialAgentSlug]);

  useEffect(() => {
    if (customAgentsLoading) return;
    if (selectedAgentSlug && !customAgents.some((agent) => agent.slug === selectedAgentSlug)) {
      setSelectedAgentSlug(null);
    }
  }, [customAgentsLoading, customAgents, selectedAgentSlug]);

  const onAgentProgressRef = useRef<(progress: AgentProgress | null) => void>(() => {});

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
            agentSlug: selectedAgentSlug ?? undefined,
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
    [threadId, customInstructions, responseStyle, citeSources, selectedAgentSlug, analysisModeRef],
  );

  useEffect(() => {
    onAgentProgressRef.current = (p) => setAgentProgress(p);
  });

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

  const { summary, setSummary } = useChatUrlSync({ threadId, messageCount: messages.length });

  const isStreaming = useMemo(() => status === 'submitted' || status === 'streaming', [status]);

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
    if (isStreaming) setDismissedError(false);
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

  const handleEdit = useCallback(
    async (messageId: string, newText: string) => {
      const cur = messages;
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
    [threadId, router, sendMessage, setMessages, confirm, messages],
  );

  const handleSubmit = useCallback(
    (text: string, images: ComposerImage[]) => {
      lastUserTextRef.current = text;
      if (analysisModeRef.current !== 'single' && images.length > 0) {
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
    },
    [sendMessage, analysisModeRef],
  );

  const handleStop = useCallback(() => stop(), [stop]);

  const lastAssistantId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const m = messages[i];
      if (m && m.role === 'assistant') return m.id;
    }
    return undefined;
  }, [messages]);

  return {
    customAgents,
    customAgentsLoading,
    selectedAgentSlug,
    setSelectedAgentSlug,
    selectedAgent,
    lastUserTextRef,
    messages,
    status,
    error,
    isStreaming,
    title,
    summary,
    setSummary,
    dismissedError,
    setDismissedError,
    agentProgress,
    confirmEl,
    lastAssistantId,
    handleCopy,
    handleRegenerate,
    handleEdit,
    handleSubmit,
    handleStop,
    chatErrorText,
  };
}
