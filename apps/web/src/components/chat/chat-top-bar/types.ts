// SPDX-License-Identifier: Apache-2.0

// Shared types for the chat top bar and its subcomponents.

import type { Symbol } from '@kestrel/shared';

import type { CustomAgentSummary } from '@/hooks/use-custom-agents';
import type { AnalysisMode } from '@/lib/analysis-mode';

export interface ThreadSummary {
  id: string;
  title: string | null;
  pinnedSymbol: Symbol | null;
  updatedAt: number;
}

export interface ChatTopBarProps {
  threadId: string;
  title: string;
  pinnedSymbol: Symbol | null;
  threads: ThreadSummary[];
  isStreaming: boolean;
  analysisMode?: AnalysisMode;
  onAnalysisModeChange?: (mode: AnalysisMode) => void;
  chatModel?: string | null;
  onChatModelChange?: (modelId: string) => void;
  modelSelectionPending?: boolean;
  splitMode?: boolean;
  onToggleSplitMode?: () => void;
  viewsOpen?: boolean;
  onToggleViews?: () => void;
  /** Active standalone agent, when the composer has one selected. */
  activeAgent?: CustomAgentSummary | null;
}
