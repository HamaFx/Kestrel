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

// Automatic chat renderer for plugin tools without a bespoke React card.
//
// The goal is that a new plugin tool looks intentional in chat with zero UI
// code: scalars become a tabular key/value grid, arrays of objects become a
// compact table, and everything else falls back to collapsible JSON. Numbers
// use tabular figures so columns line up. Payload rendering lives in
// `auto-plugin-tool-blocks.tsx`; formatting helpers in
// `auto-plugin-tool-format.ts`.
import {
  IconAlertCircle,
  IconChevronDown,
  IconChevronRight,
  IconPlugConnected,
} from '@tabler/icons-react';
import { useEffect, useId, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/formatters/cn';

import { PluginOutput } from './auto-plugin-tool-blocks';
import { humanizeToolName, summarize } from './auto-plugin-tool-format';

export interface AutoPluginToolCardProps {
  name: string;
  output: unknown;
  state: 'loading' | 'done' | 'error';
  errorMessage?: string;
}

export function AutoPluginToolCard({ name, output, state, errorMessage }: AutoPluginToolCardProps) {
  const [expanded, setExpanded] = useState(state === 'error');
  const contentId = useId();
  const title = humanizeToolName(name);
  const running = state === 'loading';
  const failed = state === 'error';

  // A card that streamed successfully then failed (or was already failed)
  // should show the error without an extra click.
  useEffect(() => {
    if (state === 'error') setExpanded(true);
  }, [state]);

  return (
    <Card
      as="section"
      aria-label={`${title} plugin tool`}
      className={cn('gap-0 overflow-hidden p-0', failed && 'border-danger/30')}
    >
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
        aria-controls={contentId}
        className="border-divider hover:bg-bg-elev-2/60 flex min-h-11 w-full items-center gap-2 border-b px-3.5 py-2 text-left transition-colors"
      >
        <span className="relative grid size-4 shrink-0 place-items-center">
          {running ? (
            <span
              aria-hidden="true"
              className="border-brand/30 border-t-brand absolute inset-0 animate-spin rounded-full border-[1.5px]"
            />
          ) : failed ? (
            <IconAlertCircle className="text-danger size-4" aria-hidden="true" />
          ) : (
            <IconPlugConnected className="text-brand size-4" aria-hidden="true" />
          )}
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className={cn('text-body-sm font-medium', failed ? 'text-danger' : 'text-fg')}>
              {title}
            </span>
            <Badge tone={failed ? 'danger' : running ? 'brand' : 'neutral'}>
              {failed ? 'failed' : running ? 'running' : 'plugin'}
            </Badge>
          </span>
          {!failed ? (
            <span className="text-fg-subtle text-caption mt-0.5 block truncate font-mono tabular-nums">
              {running ? 'waiting for result…' : summarize(output)}
            </span>
          ) : null}
        </span>

        <span className="text-fg-subtle shrink-0">
          {expanded ? (
            <IconChevronDown className="size-4" aria-hidden="true" />
          ) : (
            <IconChevronRight className="size-4" aria-hidden="true" />
          )}
        </span>
      </button>

      {expanded ? (
        <div id={contentId} className="min-w-0 space-y-3 px-3.5 py-3">
          {failed ? (
            <p role="alert" className="text-danger text-body-sm">
              {errorMessage ?? 'The plugin tool returned an error.'}
            </p>
          ) : running ? (
            <div className="space-y-2" aria-busy="true" aria-live="polite">
              <span className="bg-bg-elev-2 block h-3 w-2/3 animate-pulse rounded-sm" />
              <span className="bg-bg-elev-2 block h-3 w-1/2 animate-pulse rounded-sm" />
            </div>
          ) : (
            <PluginOutput output={output} />
          )}
        </div>
      ) : null}
    </Card>
  );
}
