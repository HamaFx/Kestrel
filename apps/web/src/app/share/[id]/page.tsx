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
import type { Metadata } from 'next';
import { Link } from 'next-view-transitions';
import { notFound } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { KestrelBrand } from '@/components/brand/kestrel-brand';

import { PriceLineChart } from './price-line-chart';

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
                  {snap.overlay.markers.length}{' '}
                  {snap.overlay.markers.length === 1 ? 'Marker' : 'Markers'} ·{' '}
                  {snap.overlay.priceLines.length}{' '}
                  {snap.overlay.priceLines.length === 1 ? 'Price Level' : 'Price Levels'}
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
