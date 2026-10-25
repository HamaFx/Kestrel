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
// use tabular figures so columns line up.
import {
  IconAlertCircle,
  IconChevronDown,
  IconChevronRight,
  IconPlugConnected,
} from '@tabler/icons-react';
import { useEffect, useId, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/cn';

export interface AutoPluginToolCardProps {
  name: string;
  output: unknown;
  state: 'loading' | 'done' | 'error';
  errorMessage?: string;
}

const MAX_TABLE_ROWS = 5;
const MAX_TABLE_COLUMNS = 6;
const MAX_PREVIEW_CHARS = 120;

function humanizeToolName(name: string): string {
  return name
    .replace(/^tool-/, '')
    .split(/[_-]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isScalar(value: unknown): boolean {
  return (
    value === null ||
    value === undefined ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  );
}

function formatScalar(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'number') {
    return Number.isFinite(value)
      ? new Intl.NumberFormat(undefined, { maximumFractionDigits: 6 }).format(value)
      : String(value);
  }
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  const text = String(value);
  return text.length > MAX_PREVIEW_CHARS ? `${text.slice(0, MAX_PREVIEW_CHARS)}…` : text;
}

function summarize(output: unknown): string {
  if (output === null || output === undefined) return 'no output';
  if (typeof output === 'string') return formatScalar(output);
  if (Array.isArray(output)) return `${output.length} item${output.length === 1 ? '' : 's'}`;
  if (isPlainObject(output)) {
    if (typeof output['message'] === 'string' && output['message'].length > 0) {
      return formatScalar(output['message']);
    }
    const scalars = Object.entries(output).filter(([, value]) => isScalar(value));
    if (scalars.length === 0) return `${Object.keys(output).length} fields`;
    return scalars
      .slice(0, 2)
      .map(([key, value]) => `${key} ${formatScalar(value)}`)
      .join(' · ');
  }
  return formatScalar(output);
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

function PluginOutput({ output }: { output: unknown }) {
  if (output === null || output === undefined) {
    return <p className="text-fg-muted text-body-sm">No output was returned.</p>;
  }

  if (isPlainObject(output)) {
    const scalarEntries = Object.entries(output).filter(([, value]) => isScalar(value));
    const arrayEntries = Object.entries(output).filter((entry): entry is [string, unknown[]] =>
      Array.isArray(entry[1]),
    );
    const objectEntries = Object.entries(output).filter(
      (entry): entry is [string, Record<string, unknown>] => isPlainObject(entry[1]),
    );

    return (
      <div className="space-y-3">
        {scalarEntries.length > 0 ? (
          <dl className="grid grid-cols-1 gap-x-4 gap-y-1.5 sm:grid-cols-2">
            {scalarEntries.map(([key, value]) => (
              <div key={key} className="flex min-w-0 items-baseline justify-between gap-3">
                <dt className="text-fg-subtle shrink-0 font-mono text-[11px] tracking-wide uppercase">
                  {key.replaceAll('_', ' ')}
                </dt>
                <dd className="text-fg truncate text-right font-mono text-xs tabular-nums">
                  {formatScalar(value)}
                </dd>
              </div>
            ))}
          </dl>
        ) : null}

        {arrayEntries.map(([key, value]) => (
          <div key={key} className="min-w-0">
            {shouldRenderTable(value) ? (
              <TableBlock label={key} rows={value as Array<Record<string, unknown>>} />
            ) : (
              <ChipBlock label={key} values={value} />
            )}
          </div>
        ))}

        {objectEntries.map(([key, value]) => (
          <ObjectBlock key={key} label={key} value={value} />
        ))}

        <RawPayload output={output} />
      </div>
    );
  }

  if (Array.isArray(output)) {
    return (
      <div className="space-y-3">
        {shouldRenderTable(output) ? (
          <TableBlock label="items" rows={output as Array<Record<string, unknown>>} />
        ) : (
          <ChipBlock label="items" values={output} />
        )}
        <RawPayload output={output} />
      </div>
    );
  }

  return <p className="text-fg text-body-sm font-mono tabular-nums">{formatScalar(output)}</p>;
}

function shouldRenderTable(value: unknown[]): boolean {
  return value.length > 0 && value.every((row) => isPlainObject(row));
}

function TableBlock({ label, rows }: { label: string; rows: Array<Record<string, unknown>> }) {
  const columns = Array.from(new Set(rows.flatMap((row) => Object.keys(row)))).slice(
    0,
    MAX_TABLE_COLUMNS,
  );
  const visible = rows.slice(0, MAX_TABLE_ROWS);
  const hidden = rows.length - visible.length;

  return (
    <div className="min-w-0">
      <BlockLabel label={label} meta={`${rows.length} row${rows.length === 1 ? '' : 's'}`} />
      <div className="border-divider overflow-x-auto rounded-md border">
        <table className="w-full border-collapse text-left font-mono text-xs tabular-nums">
          <thead className="bg-bg-elev-2">
            <tr>
              {columns.map((column) => (
                <th
                  key={column}
                  scope="col"
                  className="text-fg-subtle px-2 py-1.5 text-[11px] font-medium tracking-wide uppercase"
                >
                  {column.replaceAll('_', ' ')}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((row, index) => (
              <tr key={index} className="border-divider border-t">
                {columns.map((column) => (
                  <td key={column} className="text-fg max-w-48 truncate px-2 py-1.5">
                    {isScalar(row[column])
                      ? formatScalar(row[column])
                      : formatScalar(JSON.stringify(row[column]))}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {hidden > 0 ? (
        <p className="text-fg-subtle text-caption mt-1">
          +{hidden} more row{hidden === 1 ? '' : 's'}
        </p>
      ) : null}
    </div>
  );
}

function ChipBlock({ label, values }: { label: string; values: unknown[] }) {
  const visible = values.slice(0, 8);
  return (
    <div>
      <BlockLabel label={label} meta={`${values.length}`} />
      <div className="flex flex-wrap gap-1.5">
        {visible.map((value, index) => (
          <span
            key={index}
            className="bg-bg-elev-2 text-fg-muted rounded-md px-2 py-0.5 font-mono text-[11px] tabular-nums"
          >
            {formatScalar(value)}
          </span>
        ))}
        {values.length > visible.length ? (
          <span className="text-fg-subtle px-1 font-mono text-[11px]">
            +{values.length - visible.length}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function ObjectBlock({ label, value }: { label: string; value: Record<string, unknown> }) {
  return (
    <details className="group">
      <summary className="text-fg-subtle hover:text-fg cursor-pointer list-none font-mono text-[11px] tracking-wide uppercase">
        {label.replaceAll('_', ' ')}
      </summary>
      <pre className="bg-bg-elev-2 text-fg-muted mt-1.5 max-h-48 overflow-auto rounded-md p-2 font-mono text-[11px] leading-relaxed">
        {safeStringify(value)}
      </pre>
    </details>
  );
}

function BlockLabel({ label, meta }: { label: string; meta: string }) {
  return (
    <div className="mb-1.5 flex items-center justify-between gap-2">
      <span className="text-fg-subtle font-mono text-[11px] tracking-wide uppercase">
        {label.replaceAll('_', ' ')}
      </span>
      <span className="text-fg-subtle font-mono text-[11px] tabular-nums">{meta}</span>
    </div>
  );
}

function RawPayload({ output }: { output: unknown }) {
  return (
    <details className="group">
      <summary className="text-fg-subtle hover:text-fg cursor-pointer list-none font-mono text-[11px] tracking-wide uppercase">
        raw payload
      </summary>
      <pre className="bg-bg-elev-2 text-fg-muted mt-1.5 max-h-56 overflow-auto rounded-md p-2 font-mono text-[11px] leading-relaxed">
        {safeStringify(output)}
      </pre>
    </details>
  );
}

function safeStringify(value: unknown): string {
  try {
    const text = JSON.stringify(value, null, 2);
    if (text === undefined) return String(value);
    return text.length > 8000 ? `${text.slice(0, 8000)}\n… (truncated)` : text;
  } catch {
    return String(value);
  }
}
