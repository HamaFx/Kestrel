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

// Root 404. Plain server component — the request proxy already handles unauthed
// requests by redirecting to /login, so this page is reached only when
// authed users hit a typo'd URL.

import { Link } from 'next-view-transitions';

import { KestrelBrand } from '@/components/brand/kestrel-brand';

export default function NotFound() {
  return (
    <main className="bg-bg-elev-1 text-fg flex min-h-svh flex-col items-center justify-center gap-6 px-6 text-center">
      <KestrelBrand variant="lockup" decorative className="w-32" />
      <div className="flex flex-col gap-2" role="alert">
        <h1 className="text-lg font-semibold">Page not found</h1>
        <p className="text-fg-muted max-w-xs text-sm">
          That chart pattern didn&apos;t resolve. The page you&apos;re looking for doesn&apos;t
          exist or has been moved.
        </p>
      </div>
      <Link
        href="/chat"
        className="bg-fg inline-flex h-10 items-center rounded-sm px-4 text-sm font-medium text-black transition-opacity hover:opacity-90"
      >
        Go to chat
      </Link>
    </main>
  );
}
