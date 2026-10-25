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

// Chat toolbar state: analysis mode, chat model, and sidecar split view.
import { useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';

import { apiMutate } from '@/lib/http/api-client';

import type { AnalysisMode } from '../chat-top-bar';
import type { DockTab } from '../thread-views-dock';

export function useChatToolbar({
  threadId,
  initialAnalysisMode,
  initialChatModel,
  initialShowAgentOpinions,
}: {
  threadId: string;
  initialAnalysisMode: AnalysisMode;
  initialChatModel: string | null;
  initialShowAgentOpinions: boolean;
}) {
  const [analysisMode, setAnalysisMode] = useState<AnalysisMode>(initialAnalysisMode);
  const analysisModeRef = useRef<AnalysisMode>(initialAnalysisMode);
  const [showAgentOpinions] = useState(initialShowAgentOpinions);
  const [chatModel, setChatModel] = useState<string | null>(initialChatModel);
  const chatModelRef = useRef<string | null>(initialChatModel);
  const [modelSelectionPending, setModelSelectionPending] = useState(false);
  const [splitMode, setSplitMode] = useState(false);
  const [dockTab, setDockTab] = useState<DockTab>('chart');

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

  return {
    analysisMode,
    analysisModeRef,
    showAgentOpinions,
    chatModel,
    modelSelectionPending,
    splitMode,
    setSplitMode,
    dockTab,
    setDockTab,
    handleChatModelChange,
    handleAnalysisModeChange,
  };
}
