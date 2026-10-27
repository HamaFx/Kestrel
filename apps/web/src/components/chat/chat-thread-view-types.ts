import type { Symbol } from '@kestrel/shared';
import type { UIMessage } from 'ai';

import type { CustomAgentSummary } from '@/hooks/use-custom-agents';
import type { AgentProgress } from '@/lib/chat-transport';

import type { AnalysisMode } from './chat-top-bar';
import type { ComposerImage } from './composer';
import type { ThreadSummaryState } from './hooks/use-chat-url-sync';

export interface ChatThreadViewProps {
  threadId: string;
  pinnedSymbol: Symbol | null;
  splitMode: boolean;
  /** Desktop War Room (`Council` dock tab) is open: collapse duplicate inline cards. */
  warRoomOpen: boolean;
  messages: UIMessage[];
  status: string;
  isStreaming: boolean;
  error: Error | undefined;
  dismissedError: boolean;
  setDismissedError: (value: boolean) => void;
  summary: ThreadSummaryState | null;
  setSummary: (value: ThreadSummaryState | null) => void;
  agentProgress: AgentProgress | null;
  showAgentOpinions: boolean;
  lastAssistantId: string | undefined;
  lastUserTextRef: { current: string };
  analysisMode: AnalysisMode;
  onAnalysisModeChange: (mode: AnalysisMode) => void;
  chatModel: string | null;
  onChatModelChange: (modelId: string) => void;
  modelSelectionPending: boolean;
  onSubmit: (text: string, images: ComposerImage[]) => void;
  onStop: () => void;
  onCopy: (text: string) => void;
  onRegenerate: (opts?: { modelOverride?: string }) => void;
  onEdit: (messageId: string, newText: string) => void;
  placeholder: string;
  customAgents: readonly CustomAgentSummary[];
  selectedAgentSlug: string | null;
  onAgentChange: (slug: string | null) => void;
}
