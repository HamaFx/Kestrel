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

// Bespoke renderer for the `get_session_levels` tool part.
//
// Three pill rows for asia / london / ny — open / high / low / close.
// Sessions still forming render with a soft "forming…" tag instead of a
// closing print.

import { priceDecimals, type SessionRange, type SessionTag } from '@kestrel/shared';

import type { ToolPartProps } from './registry';

const SESSION_LABEL: Record<SessionTag, string> = {
  asia: 'Asia',
  london: 'London',
  ny: 'NY',
};

export function GetSessionLevelsPart({
  output,
  state,
  errorMessage,
}: ToolPartProps<'get_session_levels'>) {
  if (state === 'error') return <ErrorCard message={errorMessage} />;
  if (state === 'loading' || !output) return <SkeletonCard />;

  if (output.pipelinePending) {
    return (
      <div className="border-border bg-bg-elev-1 text-fg-muted rounded-sm border p-3 text-sm">
        No candles available yet for {output.symbol} — try again in a minute.
      </div>
    );
  }

  return (
    <div className="border-border bg-bg-elev-1 flex flex-col gap-3 rounded-sm border p-3">
      <header className="flex items-baseline justify-between gap-2">
        <h3 className="text-fg text-sm font-semibold">{output.symbol} · session levels</h3>
        <span className="text-fg-subtle text-caption font-mono">
          {new Date(output.asOf).toISOString().slice(11, 16)}Z
        </span>
      </header>

      <SessionList rows={output.today} title="Today" symbol={output.symbol} />
      {output.prior ? (
        <SessionList rows={output.prior} title="Prior day" symbol={output.symbol} />
      ) : null}

      {output.notes ? <p className="text-fg-muted text-xs">{output.notes}</p> : null}
    </div>
  );
}

function SessionList({
  rows,
  title,
  symbol,
}: {
  rows: SessionRange[];
  title: string;
  symbol: string;
}) {
  return (
    <section>
      <h4 className="text-fg-subtle text-body-sm mb-1 tracking-wide uppercase">{title}</h4>
      <ul className="flex flex-col gap-1">
        {rows.map((r) => (
          <li
            key={`${r.session}-${r.fromMs}`}
            className="text-body-sm flex items-baseline justify-between gap-2 tabular-nums"
          >
            <span className="text-fg w-14 font-semibold">{SESSION_LABEL[r.session]}</span>
            <span className="text-fg-muted flex-1">
              O {fmt(r.open, symbol)} · H {fmt(r.high, symbol)} · L {fmt(r.low, symbol)} ·{' '}
              {r.forming ? (
                <em className="text-warn not-italic">forming…</em>
              ) : (
                `C ${fmt(r.close, symbol)}`
              )}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function fmt(n: number | null, symbol: string): string {
  if (n === null || !Number.isFinite(n)) return '—';
  return n.toFixed(priceDecimals(symbol));
}

function SkeletonCard() {
  return (
    <div
      className="border-border bg-bg-elev-1 rounded-sm border p-3"
      aria-busy="true"
      aria-label="Computing session levels"
    >
      <div className="bg-bg-elev-2 h-4 w-1/2 animate-pulse rounded-sm" />
      <div className="bg-bg-elev-2 mt-3 h-20 animate-pulse rounded-sm" />
    </div>
  );
}

function ErrorCard({ message }: { message?: string }) {
  return (
    <div
      role="alert"
      className="border-danger/30 bg-bg-elev-1 text-danger rounded-sm border p-3 text-sm"
    >
      Session levels failed{message ? ` · ${message}` : ''}
    </div>
  );
}
