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
import type { CustomAgentSummary } from '@/hooks/use-custom-agents';
import { cn } from '@/lib/formatters/cn';

import { ChatErrorBanner } from './chat-empty-state';
import type { AnalysisMode } from './chat-top-bar';
import { Composer, type ComposerImage } from './composer';

export function ChatComposerDock({
  splitMode,
  error,
  analysisMode,
  onAnalysisModeChange,
  chatModel,
  onChatModelChange,
  onSubmit,
  onStop,
  isStreaming,
  modelSelectionPending,
  placeholder,
  customAgents,
  selectedAgentSlug,
  onAgentChange,
}: {
  splitMode: boolean;
  error: Error | undefined;
  analysisMode: AnalysisMode;
  onAnalysisModeChange: (mode: AnalysisMode) => void;
  chatModel: string | null;
  onChatModelChange: (modelId: string) => void;
  onSubmit: (text: string, images: ComposerImage[]) => void;
  onStop: () => void;
  isStreaming: boolean;
  modelSelectionPending: boolean;
  placeholder: string;
  customAgents: readonly CustomAgentSummary[];
  selectedAgentSlug: string | null;
  onAgentChange: (slug: string | null) => void;
}) {
  return (
    <div
      className={cn(
        'mx-auto flex w-full flex-col px-4 pt-1',
        splitMode ? 'w-full max-w-2xl xl:max-w-3xl' : 'max-w-3xl xl:max-w-4xl',
      )}
    >
      {error && <ChatErrorBanner error={error} />}
      <Composer
        analysisMode={analysisMode}
        onAnalysisModeChange={onAnalysisModeChange}
        chatModel={chatModel}
        onChatModelChange={onChatModelChange}
        onSubmit={onSubmit}
        onStop={onStop}
        isStreaming={isStreaming}
        disabled={isStreaming || modelSelectionPending}
        placeholder={placeholder}
        customAgents={customAgents}
        selectedAgentSlug={selectedAgentSlug}
        onAgentChange={onAgentChange}
      />
    </div>
  );
}
