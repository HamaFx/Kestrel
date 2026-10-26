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

// /share/[id] — public read route for analysis snapshots.
//
// Bypassed by the password gate (see proxy.ts) and verified instead
// by an HMAC-signed token in the `?t=<token>` query param. The route
// renders markdown body, branded frame, chart annotations, and OG image.
//
// Status responses:
//   - 401 (rendered) → missing/invalid token
//   - 410 (rendered) → snapshot expired
//   - 404 (rendered) → snapshot id not found

import { getActiveSnapshot, verifyShareToken } from '@kestrel/ai';
import type { ChartPriceLine } from '@kestrel/shared';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Link } from 'next-view-transitions';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { KestrelBrand } from '@/components/brand/kestrel-brand';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ t?: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return { title: 'Not Found' };
  }
  return { title: `Shared analysis · ${id.slice(0, 8)}` };
}

/** Coerce a persisted price (JSON may hold either form) to a number. */
function toPrice(value: number | string): number {
  return typeof value === 'number' ? value : Number.parseFloat(value);
}

/**
 * Price-line visualization for the annotated chart snapshot.
 *
 * Uses a fixed `0 0 400 48` viewBox with numeric coordinates — the previous
 * percentage `y1={`${y}%`}` coordinates distorted stroke widths under
 * `preserveAspectRatio="none"`.
 */
function PriceLineChart({ lines }: { lines: readonly ChartPriceLine[] }) {
  const prices = lines.map((line) => toPrice(line.price)).filter((price) => Number.isFinite(price));
  if (prices.length === 0) return null;

  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;

  return (
    <div className="bg-bg-elev-1 border-border/80 relative mb-3 h-14 w-full overflow-hidden rounded-xl border">
      <svg
        className="size-full"
        viewBox="0 0 400 48"
        preserveAspectRatio="none"
        role="img"
        aria-label="Price lines visualization"
      >
        {lines.slice(0, 20).map((line, i) => {
          const price = toPrice(line.price);
          if (!Number.isFinite(price)) return null;
          const y = 6 + ((max - price) / range) * 36;
          return (
            <line
              key={i}
              x1="0"
              y1={y}
              x2="400"
              y2={y}
              stroke={line.color || '#e5e5e5'}
              strokeWidth="1.5"
              strokeDasharray={i % 2 === 0 ? 'none' : '4 2'}
              vectorEffect="non-scaling-stroke"
            />
          );
        })}
      </svg>
    </div>
  );
}

export default async function ShareSnapshotPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const sp = await searchParams;
  const token = sp.t ?? '';

  if (!UUID_RE.test(id)) {
    notFound();
  }

  const secret = process.env.AUTH_COOKIE_SECRET ?? '';
  const payload = secret ? verifyShareToken(token, secret) : null;
  if (!payload || payload.id !== id) {
    notFound();
  }

  const snap = await getActiveSnapshot(id);
  if (!snap) {
    notFound();
  }

  const expiry = new Date(snap.expiresAt).toISOString().slice(0, 16).replace('T', ' ');

  return (
    <div className="bg-bg text-fg flex min-h-svh flex-col">
      <header className="border-border/80 flex items-center justify-between gap-3 border-b px-6 py-4">
        <KestrelBrand variant="lockup" href="/" className="shrink-0" />
        <Link
          href="/chat"
          className="bg-brand inline-flex h-9 items-center rounded-md px-3.5 text-sm font-medium text-white shadow-[0_4px_14px_rgba(255,54,22,0.3)] transition-opacity hover:opacity-90"
        >
          Open Kestrel →
        </Link>
      </header>

      <main className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-6">
        <section className="surface-panel rounded-2xl border border-white/10 p-6">
          <h1 className="font-display text-fg text-lg leading-snug font-normal tracking-[-0.03em]">
            {snap.title}
          </h1>

          <article className="md-prose text-fg-muted mt-4 max-w-none text-sm leading-[1.4]">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{snap.body}</ReactMarkdown>
          </article>

          {snap.overlay && snap.symbol && snap.tf ? (
            <section
              aria-label="Chart annotations"
              className="border-border/80 bg-bg-elev-1 mt-5 rounded-xl border p-4"
            >
              <header className="mb-3 flex items-baseline justify-between">
                <h2 className="text-fg font-mono text-sm font-medium tabular-nums">
                  {snap.symbol} · {snap.tf}
                </h2>
                <span className="text-fg-subtle text-caption tabular-nums">
                  {snap.overlay.markers.length}m / {snap.overlay.priceLines.length}l
                </span>
              </header>

              {snap.overlay.priceLines.length > 0 && (
                <PriceLineChart lines={snap.overlay.priceLines} />
              )}

              <ul className="text-fg-muted text-body-sm flex flex-wrap gap-1.5">
                {snap.overlay.priceLines.slice(0, 8).map((line, i) => (
                  <li
                    key={`${line.title}-${i}`}
                    className="border-border/80 bg-bg-elev-2 rounded-md border px-2 py-0.5 tabular-nums"
                    style={{ borderColor: line.color }}
                  >
                    {line.title}: {String(line.price)}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </section>
      </main>

      <footer className="border-border/80 border-t px-6 py-4 text-center">
        <p className="text-fg-subtle text-caption">Generated by Kestrel · expires {expiry}Z</p>
      </footer>
    </div>
  );
}
