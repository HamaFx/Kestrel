'use client';

// SPDX-License-Identifier: Apache-2.0

// Live deliberation state rendered inside the conversation stream. Locked
// Decision 4A retired the pixel-desk sprites: this entry point now delegates
// to the canonical Hoplite `SyndicateCircuitLive` plasma spine so every
// existing caller automatically gets the new Council UI.
import { SyndicateCircuitLive } from '../syndicate-dossier/syndicate-circuit-live';
import type { AgentProgress } from '@/lib/chat-transport';

export function PixelDeskThinking({
  agentProgress,
  fallbackMode,
  className,
}: {
  agentProgress?: AgentProgress | null;
  fallbackMode?: string;
  className?: string;
}) {
  return (
    <SyndicateCircuitLive
      agentProgress={agentProgress}
      fallbackMode={fallbackMode}
      className={className}
    />
  );
}
