'use client';

// SPDX-License-Identifier: Apache-2.0

// Derives the dock's certified dossier from the newest settled council run:
// same deterministic levels and plan id the inline Syndicate card renders.
import type { UIMessage } from 'ai';
import { useMemo } from 'react';

import type { AgentProgress } from '@/lib/chat-transport';

import {
  buildSyndicatePlanId,
  extractSyndicateTradeLevels,
} from '../parts/syndicate-dossier/extract-trade-levels';

export function useDockDossier(
  messages: UIMessage[],
  latestSyndicate: AgentProgress | null,
  fallbackSymbol: string,
) {
  const dockSymbol = latestSyndicate?.symbol ?? fallbackSymbol;

  const tradeOpinions = useMemo(
    () =>
      (latestSyndicate?.agents ?? [])
        .filter((agent) => agent.opinion)
        .map((agent) => ({
          agentName: agent.agentName,
          bias: agent.opinion?.bias ?? ('neutral' as const),
          confidence: agent.opinion?.confidence ?? 0,
          ...(agent.opinion?.reasoning ? { reasoning: agent.opinion.reasoning } : {}),
        })),
    [latestSyndicate],
  );

  const latestText = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const message = messages[i];
      if (!message || message.role !== 'assistant') continue;
      const text = (message.parts ?? [])
        .filter((part): part is { type: 'text'; text: string } => {
          const candidate = part as { type?: string; text?: unknown };
          return candidate.type === 'text' && typeof candidate.text === 'string';
        })
        .map((part) => part.text)
        .join('\n');
      if (text.length > 0) return text;
    }
    return '';
  }, [messages]);

  const levels = useMemo(
    () =>
      extractSyndicateTradeLevels({
        symbol: dockSymbol,
        opinions: tradeOpinions,
        text: latestText,
      }),
    [dockSymbol, tradeOpinions, latestText],
  );

  const planId = useMemo(
    () =>
      buildSyndicatePlanId(
        [
          dockSymbol,
          latestSyndicate?.mode ?? 'full',
          ...tradeOpinions.map((o) => `${o.agentName}:${o.bias}:${o.confidence}`),
          levels.entry,
          levels.invalidation,
        ].join('|'),
      ),
    [dockSymbol, latestSyndicate?.mode, tradeOpinions, levels.entry, levels.invalidation],
  );

  return { symbol: dockSymbol, levels, planId };
}
