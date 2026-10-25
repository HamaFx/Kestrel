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
import { IconCode, IconLoader2, IconPlayerPlay, IconTrash } from '@tabler/icons-react';
import type { z } from 'zod';

import type { StrategySummarySchema } from '../schemas';
import { fmtDate } from './format';

type StrategySummary = z.infer<typeof StrategySummarySchema>;

export function StrategyLibrary({
  strategies,
  busyId,
  onLoad,
  onDelete,
}: {
  strategies: readonly StrategySummary[];
  busyId: string | null;
  onLoad: (strategy: StrategySummary) => void;
  onDelete: (strategyId: string) => void;
}) {
  if (strategies.length === 0) {
    return (
      <div className="border-border/50 text-fg-subtle rounded-xl border border-dashed p-8 text-center text-xs">
        No saved strategies yet. Ask Kestrel to save a strategy, or save one from a run&apos;s
        source.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {strategies.map((strategy) => (
        <article
          key={strategy.id}
          className="surface-panel flex flex-col gap-2 rounded-xl border border-white/10 p-3"
        >
          <header className="flex items-start justify-between gap-2">
            <div className="flex min-w-0 flex-col">
              <h3 className="text-fg truncate text-sm font-semibold">{strategy.name}</h3>
              <span className="text-fg-subtle font-mono text-[10px]">
                {strategy.slug} · {fmtDate(strategy.updatedAt)}
              </span>
            </div>
            <IconCode className="text-fg-subtle size-4 shrink-0" />
          </header>
          {strategy.description ? (
            <p className="text-fg-muted line-clamp-2 text-[11px]">{strategy.description}</p>
          ) : null}
          {strategy.tags.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {strategy.tags.map((tag) => (
                <span
                  key={tag}
                  className="bg-bg-elev-2 text-fg-subtle rounded px-1.5 py-0.5 font-mono text-[10px]"
                >
                  {tag}
                </span>
              ))}
            </div>
          ) : null}
          <footer className="mt-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => onLoad(strategy)}
              className="border-border/60 text-fg-muted hover:text-fg inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-[11px] font-semibold transition-colors"
            >
              <IconPlayerPlay className="size-3.5" />
              Load into form
            </button>
            <button
              type="button"
              onClick={() => onDelete(strategy.id)}
              disabled={busyId !== null}
              className="text-fg-subtle hover:text-danger ml-auto inline-flex size-7 items-center justify-center rounded-md transition-colors disabled:opacity-40"
              aria-label={`Delete ${strategy.name}`}
            >
              {busyId === strategy.id ? (
                <IconLoader2 className="size-3.5 animate-spin" />
              ) : (
                <IconTrash className="size-3.5" />
              )}
            </button>
          </footer>
        </article>
      ))}
    </div>
  );
}
