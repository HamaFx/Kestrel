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
          <KestrelBrand variant="lockup" decorative priority className="w-auto" />
          <div className="flex max-w-sm flex-col gap-2">
            <h1 className="sr-only">Kestrel</h1>
            <p className="text-fg font-display text-lg font-normal tracking-[-0.02em] sm:text-xl">
              Sovereign AI committee for{' '}
              <span className="font-redaction-35 italic text-brand">gold & forex</span>.
            </p>
            <p className="text-fg-muted font-sans text-xs leading-relaxed">
              Four autonomous specialist desks deliberating with mathematical risk parameters.
            </p>
          </div>
          <span aria-hidden="true" className="brand-signal-line h-px w-16" />
        </header>

        <div className="surface-panel rounded-2xl border border-brand-border/70 flex flex-col gap-6 p-6 shadow-[0_24px_64px_-16px_rgba(0,0,0,0.8),inset_0_1px_0_rgba(255,255,255,0.1)]">
          {children}
        </div>
      </div>
    </main>
  );
}
