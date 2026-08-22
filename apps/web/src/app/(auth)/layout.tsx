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

import type { Metadata } from 'next';

import { KestrelBrand } from '@/components/brand/kestrel-brand';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  // Use one absolute auth-shell title so the root title template does not
  // produce the duplicated "Kestrel · Kestrel" browser title.
  title: 'Kestrel account',
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main
      className="brand-atmosphere relative flex min-h-svh flex-col overflow-hidden px-6"
      style={{
        paddingTop: 'max(env(safe-area-inset-top), 24px)',
        paddingBottom: 'max(env(safe-area-inset-bottom), 24px)',
      }}
    >
      <div className="relative z-10 mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-8 py-8">
        <header className="flex flex-col items-center gap-5 text-center">
          <KestrelBrand variant="lockup" decorative priority className="w-44 sm:w-52" />
          <div className="flex max-w-sm flex-col gap-2">
            <h1 className="sr-only">Kestrel</h1>
            <p className="text-fg text-base font-semibold tracking-tight sm:text-lg">
              AI market intelligence for gold, forex, and crypto.
            </p>
            <p className="text-fg-muted text-sm leading-relaxed">
              See the market clearly with live context, analysis, and a sharper view of what matters
              next.
            </p>
          </div>
          <span aria-hidden="true" className="brand-signal-line h-px w-16" />
        </header>

        <div className="surface-panel border-brand-border/70 flex flex-col gap-6 p-6">
          {children}
        </div>
      </div>
    </main>
  );
}
