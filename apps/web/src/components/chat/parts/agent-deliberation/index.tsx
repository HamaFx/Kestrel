// SPDX-License-Identifier: Apache-2.0

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

// Canonical committee surface dispatcher (Locked Decision 4A): delegates to
// the live Hoplite Plasma Circuit Spine while the council deliberates, and to
// the settled `SyndicateDossierCard` once every desk has reported. Desk
// metadata lives in `agent-meta.tsx`; the live phalanx in `deliberation-live`.
import { SyndicateDossierCard } from '../syndicate-dossier/syndicate-dossier-card';
import type { AgentDeliberationProps, AgentProgress } from './agent-meta';
import { DeliberationLive } from './deliberation-live';

export function AgentDeliberation({
  agents,
  mode,
  status,
  error,
  comparisonSymbols,
  critiques,
  stage,
  symbol,
  compactInline,
  onOpenWarRoom,
}: AgentDeliberationProps) {
  if (!Array.isArray(agents) || agents.length === 0) return null;

  const isFailed = status === 'failed';
  const isRetrying = status === 'retrying';
  const allDone = agents.length > 0 && agents.every((a) => a.status === 'done' || a.status === 'error');
  const opinions = agents.filter((a) => a.opinion);

  if (allDone && !isFailed && !isRetrying) {
    return (
      <SyndicateDossierCard
        agents={agents}
        opinions={opinions}
        mode={mode}
        {...(status ? { status } : {})}
        {...(critiques ? { critiques } : {})}
        {...(symbol ? { symbol } : {})}
        {...(compactInline ? { compactInline: true } : {})}
        {...(onOpenWarRoom ? { onOpenWarRoom } : {})}
      />
    );
  }

  return (
    <div role="status" aria-live="polite" className="flex w-full">
      <DeliberationLive
        agents={agents as AgentProgress[]}
        mode={mode}
        {...(status ? { status } : {})}
        {...(error ? { error } : {})}
        {...(comparisonSymbols ? { comparisonSymbols } : {})}
        {...(stage ? { stage } : {})}
      />
    </div>
  );
}
