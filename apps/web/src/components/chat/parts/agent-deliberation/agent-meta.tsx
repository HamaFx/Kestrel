// SPDX-License-Identifier: Apache-2.0

'use client';

// Desk metadata and shared types for the agent-deliberation panel.
import { IconCpu, IconNews, IconRobot, IconShield, IconTrendingUp } from '@tabler/icons-react';
import type { ReactNode } from 'react';

export interface AgentOpinion {
  agentName?: string;
  bias: 'bullish' | 'bearish' | 'neutral';
  confidence: number;
  reasoning?: string;
  summary?: string;
}

export interface AgentProgress {
  agentName: string;
  status: 'pending' | 'running' | 'done' | 'error';
  opinion?: AgentOpinion;
  error?: string;
}

export interface AgentDeliberationProps {
  agents: AgentProgress[];
  mode: string;
  status?: 'complete' | 'failed' | 'retrying';
  error?: string;
  /**
   * M-01: requested symbols for a multi-symbol comparison; the header labels
   * the run as one desk per symbol + cross-symbol synthesis.
   */
  comparisonSymbols?: string[];
}

export interface AgentMeta {
  icon: ReactNode;
  label: string;
  tokenClass: string;
  activeClass: string;
  code?: string;
  epithet?: string;
}

export const AGENT_META: Record<string, AgentMeta> = {
  technical: {
    icon: <IconTrendingUp className="size-4" />,
    label: 'Technical',
    tokenClass: 'text-bull',
    activeClass: 'border-bull/40 bg-bull/10',
    code: 'DESK-II // ASTROLABE',
    epithet: 'The Mathematical Compass',
  },
  fundamental: {
    icon: <IconNews className="size-4" />,
    label: 'Macro',
    tokenClass: 'text-info',
    activeClass: 'border-info/40 bg-info/10',
    code: 'DESK-I // HORUS',
    epithet: 'The All-Seeing Horizon',
  },
  risk: {
    icon: <IconShield className="size-4" />,
    label: 'Risk',
    tokenClass: 'text-bear',
    activeClass: 'border-bear/40 bg-bear/10',
    code: 'DESK-III // HOPLITE',
    epithet: 'The Impassable Shield',
  },
  sentiment: {
    icon: <IconRobot className="size-4" />,
    label: 'Sentiment',
    tokenClass: 'text-warn',
    activeClass: 'border-warn/40 bg-warn/10',
    code: 'DESK-IV // SENTIMENT',
    epithet: 'Whale Positioning',
  },
  decision: {
    icon: <IconCpu className="size-4" />,
    label: 'Consensus',
    tokenClass: 'text-brand',
    activeClass: 'border-brand/40 bg-brand/10',
    code: 'STAGE II // ARBITER',
    epithet: 'The Unified Syndicate',
  },
};

export const FALLBACK_META: AgentMeta = {
  icon: <IconRobot className="size-4" />,
  label: 'Specialist',
  tokenClass: 'text-fg-muted',
  activeClass: 'border-border bg-bg-elev-2',
  code: 'DESK // SPECIALIST',
  epithet: 'Independent Lens',
};

export const BIAS_TOKEN: Record<AgentOpinion['bias'], string> = {
  bullish: 'text-bull',
  bearish: 'text-bear',
  neutral: 'text-fg-muted',
};

export function formatPlainModeLabel(mode: string, comparisonSymbols?: string[]): string {
  if (comparisonSymbols && comparisonSymbols.length >= 2) {
    // M-01 (audit 2026-10-18): comparison runs are per-symbol desk passes
    // (technical + risk when enabled) plus a cross-symbol synthesis — never
    // "N committees".
    return `Comparison — per-symbol desk passes (${comparisonSymbols.join(', ')}) + cross-symbol synthesis`;
  }
  const normalized = mode.toLowerCase();
  if (normalized === 'single') {
    return 'Single-desk analysis (1 specialist desk)';
  }
  if (normalized === 'full') {
    return 'Full Committee (4 Specialist Desks)';
  }
  return `Committee Analysis · ${mode}`;
}
