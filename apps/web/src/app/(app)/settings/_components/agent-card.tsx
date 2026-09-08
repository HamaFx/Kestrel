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

// SPDX-License-Identifier: Apache-2.0

// Phase 7c — link to the schema-driven /settings/agent catalogue page.
// Server component; renders the per-tool roll-up count alongside a
// Right-arrow link so the settings list reads consistently.

import { buildToolCatalogue } from '@kestrel/ai';
import { IconChevronRight, IconRobot } from '@tabler/icons-react';
import { Link } from 'next-view-transitions';

export async function AgentCard() {
  const entries = await buildToolCatalogue().catch(() => []);
  const totalInvocations = entries.reduce((s, e) => s + e.invocations24h, 0);
  const totalFailures = entries.reduce((s, e) => s + e.failures24h, 0);

  return (
    <Link
      href="/settings/agent"
      className="surface-panel hover:border-cyan-500/40 focus-visible:ring-cyan-500/30 flex items-center gap-3.5 rounded-xl border border-white/10 p-4 shadow-[var(--shadow-chip)] transition-all tactile-press focus:outline-none focus-visible:ring-2"
    >
      <span
        aria-hidden="true"
        className="text-cyan-400 flex size-9 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5"
      >
        <IconRobot className="size-4" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-fg text-sm leading-tight font-semibold">Agent Capabilities</span>
        <span className="text-fg-subtle text-xs leading-snug font-mono text-[11px]">
          {entries.length} tool{entries.length === 1 ? '' : 's'} · {totalInvocations} invocation
          {totalInvocations === 1 ? '' : 's'} (24h)
          {totalFailures > 0 ? (
            <>
              {' '}
              ·{' '}
              <span className="text-danger">
                {totalFailures} failure{totalFailures === 1 ? '' : 's'}
              </span>
            </>
          ) : null}
        </span>
      </div>
      <IconChevronRight className="text-fg-subtle size-4" />
    </Link>
  );

}
