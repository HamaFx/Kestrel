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

// /share/receive — Web Share Target receiver.
//
// The manifest registers this route as a GET share target
// (`SHARE_TARGET_ACTION` in src/lib/pwa/share-target.ts), so another app on the
// device can hand Kestrel a title / text / url triple. All this page does is
// translate that untrusted payload into a prompt and hand it to the chat
// landing route, which creates a fresh thread and auto-sends it.
//
// It lives under `/share` on purpose: that prefix is public (see src/proxy.ts
// and src/auth.config.ts) because `/share/[id]` is the public snapshot reader.
// Nothing here touches the database, and `/chat` performs the auth check, so an
// expired session still ends on the login screen instead of a dead end.
//
// Only `GET` is declared in the manifest: a POST share target would have to
// accept `multipart/form-data` (the only enctype Chrome supports for POST),
// which is a much larger attack surface for a text-only hand-off.
import type { Metadata } from 'next';
import { Link } from 'next-view-transitions';
import { redirect } from 'next/navigation';

import { KestrelBrand } from '@/components/brand/kestrel-brand';
import { buildShareIntent, type SharePayload } from '@/lib/pwa/share-target';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Shared with Kestrel',
  // A share target URL carries the user's content; keep it out of search.
  robots: { index: false, follow: false },
};

interface PageProps {
  searchParams: Promise<SharePayload>;
}

export default async function ShareReceivePage({ searchParams }: PageProps) {
  const intent = buildShareIntent(await searchParams);

  if (!intent) {
    // Nothing usable arrived (a hand-built URL, or a share with no text). Do not
    // bounce the user into an empty thread.
    return (
      <main className="pb-safe pt-safe flex min-h-svh flex-col items-center justify-center gap-4 px-6 text-center">
        <KestrelBrand />
        <h1 className="text-fg text-lg font-semibold">Nothing to analyse</h1>
        <p className="text-fg-muted max-w-sm text-sm">
          The shared item had no title, text or link. Open Kestrel and ask directly instead.
        </p>
        {/* A plain link styled as a control: pulling the marketing button (and
            its animation bundle) into a page that normally only redirects would
            cost more than it is worth. */}
        <Link
          href="/chat"
          className="surface-chip bg-bg-elev-2 text-fg hover:text-fg tactile-press border-edge/60 inline-flex min-h-11 items-center gap-1.5 rounded-md border px-4 text-sm font-medium shadow-xs transition-all"
        >
          Open Kestrel
        </Link>
      </main>
    );
  }

  const params = new URLSearchParams({ prompt: intent.prompt, new: '1' });
  redirect(`/chat?${params.toString()}`);
}
