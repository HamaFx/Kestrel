// SPDX-License-Identifier: Apache-2.0

'use client';

// Desk metadata and shared types for the agent-deliberation panel. Every
// textual field is derived from the canonical strategist registry; only the
// Tailwind class tokens and icons (which cannot be built dynamically) live
// here, keyed by canonical desk id.
import { IconCpu, IconNews, IconRobot, IconShield, IconTrendingUp } from '@tabler/icons-react';
import type { ReactNode } from 'react';

import {
  ARBITER_DESK,
  FALLBACK_STRATEGIST_DESK,
  FOUR_SPECIALIST_DESKS,
  type StrategistDeskConfig,
} from '@/lib/kestrel-strategist-desks';

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
  /** Canonical registry artwork for neoclassical watermarks. */
  artworkPath?: string;
  accentColor?: string;
}

const DESK_TOKENS: Record<string, { icon: ReactNode; tokenClass: string; activeClass: string }> = {
  fundamental: {
    icon: <IconNews className="size-4" />,
    tokenClass: 'text-info',
    activeClass: 'border-info/40 bg-info/10',
  },
  technical: {
    icon: <IconTrendingUp className="size-4" />,
    tokenClass: 'text-bull',
    activeClass: 'border-bull/40 bg-bull/10',
  },
  risk: {
    icon: <IconShield className="size-4" />,
    tokenClass: 'text-bear',
    activeClass: 'border-bear/40 bg-bear/10',
  },
  sentiment: {
    icon: <IconRobot className="size-4" />,
    tokenClass: 'text-warn',
    activeClass: 'border-warn/40 bg-warn/10',
  },
  arbiter: {
    icon: <IconCpu className="size-4" />,
    tokenClass: 'text-brand',
    activeClass: 'border-brand/40 bg-brand/10',
  },
};

function metaFromRegistry(desk: StrategistDeskConfig, key: string): AgentMeta {
  const tokens = DESK_TOKENS[key];
  return {
    icon: tokens?.icon ?? <IconRobot className="size-4" />,
    label: desk.label,
    tokenClass: tokens?.tokenClass ?? 'text-fg-muted',
    activeClass: tokens?.activeClass ?? 'border-border bg-bg-elev-2',
    code: desk.code,
    epithet: desk.epithet,
    artworkPath: desk.artworkPath,
    accentColor: desk.accentColor,
  };
}

/** Desk metadata keyed by every canonical id and legacy alias. */
export const AGENT_META: Record<string, AgentMeta> = (() => {
  const meta: Record<string, AgentMeta> = {};
  for (const desk of FOUR_SPECIALIST_DESKS) {
    meta[desk.id] = metaFromRegistry(desk, desk.id);
    for (const alias of desk.aliases) meta[alias] = meta[desk.id]!;
  }
  const arbiter = metaFromRegistry(ARBITER_DESK, 'arbiter');
  meta.arbiter = arbiter;
  for (const alias of ARBITER_DESK.aliases) meta[alias] = arbiter;
  // Historical payloads label the synthesizer `decision`.
  meta.decision = arbiter;
  return meta;
})();

export const FALLBACK_META: AgentMeta = {
  icon: <IconRobot className="size-4" />,
  label: FALLBACK_STRATEGIST_DESK.label,
  tokenClass: 'text-fg-muted',
  activeClass: 'border-border bg-bg-elev-2',
  code: FALLBACK_STRATEGIST_DESK.code,
  epithet: FALLBACK_STRATEGIST_DESK.epithet,
  artworkPath: FALLBACK_STRATEGIST_DESK.artworkPath,
  accentColor: FALLBACK_STRATEGIST_DESK.accentColor,
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
    return 'Fast Scout — single-pass specialist read';
  }
  if (normalized === 'full') {
    return 'Convene Council — 4 Specialist Desks';
  }
  return `Committee Analysis · ${mode}`;
}
