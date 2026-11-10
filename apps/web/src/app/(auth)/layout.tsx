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

import { IconArrowLeft, IconLock } from '@tabler/icons-react';
import { Link } from 'next-view-transitions';
import type { ReactNode } from 'react';

import { BlueprintPlate } from '@/components/brand/blueprint-plates';
import { KestrelBrand } from '@/components/brand/kestrel-brand';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="bg-bg text-fg relative grid min-h-dvh lg:grid-cols-12">
      {/* Left 5-Column Credential Gateway */}
      <div className="relative z-10 flex flex-col justify-between border-white/[0.08] bg-[#0e0f11] px-6 py-8 sm:px-10 lg:col-span-5 lg:border-r lg:px-12 lg:py-10">
        <div className="relative z-10 flex items-center justify-between">
          <h1 className="sr-only">Kestrel</h1>
          <KestrelBrand variant="lockup" href="/" label="Kestrel" />
          <Link
            href="/"
            className="text-fg-muted hover:text-fg inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-1.5 font-mono text-xs transition-colors hover:border-white/15"
          >
            <IconArrowLeft className="size-3.5" aria-hidden="true" />
            <span>Back to Kestrel</span>
          </Link>
        </div>

        <div className="relative z-10 mx-auto my-12 w-full max-w-[400px]">{children}</div>

        <div className="text-fg-subtle relative z-10 flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.06] pt-4 font-mono text-[11px]">
          <span className="inline-flex items-center gap-1.5">
            <IconLock className="text-brand size-3.5" aria-hidden="true" />
            <span>AES-256-GCM BYOK Vault · Self-Hosted</span>
          </span>
          <span>PostgreSQL RLS · TOTP 2FA</span>
        </div>
      </div>

      {/* Right 7-Column Chiaroscuro Monument Canvas */}
      <div className="relative hidden overflow-hidden bg-[#121212] lg:col-span-7 lg:flex lg:flex-col lg:justify-between lg:p-12 xl:p-16">
        {/* Ambient Forge Ember Radial Illumination */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(680px circle at 64% 44%, rgba(255, 54, 22, 0.12), transparent 70%)',
          }}
        />

        {/* Full-Bleed Chiaroscuro Horus Sculpture */}
        <div
          aria-hidden="true"
          className="hero-backdrop-mask pointer-events-none absolute inset-y-0 right-0 z-0 w-[94%] opacity-60 mix-blend-screen select-none"
        >
          <BlueprintPlate id="horus" variant="backdrop" className="h-full w-full" />
        </div>

        {/* Top Minimal Status Strip */}
        <div className="relative z-10 flex items-center justify-between font-mono text-xs">
          <div className="flex items-center gap-2.5">
            <span className="bg-bull size-2 rounded-full shadow-[0_0_8px_#3f9e3d]" />
            <span className="text-fg-subtle tracking-[0.14em] uppercase">
              XAU/USD · 11 FOREX · 6 CRYPTO
            </span>
          </div>
          <span className="text-fg-subtle tracking-wider uppercase">NON-CUSTODIAL TERMINAL</span>
        </div>

        {/* Bottom Editorial Statement & Hairline Specs */}
        <div className="relative z-10 max-w-xl">
          <h2 className="font-display text-fg text-4xl leading-[1.08] font-normal tracking-[-0.02em] xl:text-5xl">
            Four Specialist AI Desks.{' '}
            <span className="font-redaction-35 text-brand italic">One Verified Trade Plan.</span>
          </h2>
          <p className="text-fg-muted mt-4 max-w-lg font-sans text-base leading-relaxed">
            Technical structure, central bank yields, 1% risk guardrails, and CFTC
            positioning—evaluated in parallel on your own infrastructure.
          </p>

          <div className="mt-8 grid grid-cols-3 divide-x divide-white/[0.1] border-t border-white/[0.1] pt-6 font-mono">
            <div className="pr-6">
              <div className="text-fg text-xl font-bold tabular-nums">4 Desks</div>
              <div className="text-fg-subtle mt-1 font-sans text-xs">Parallel Consensus</div>
            </div>
            <div className="px-6">
              <div className="text-brand text-xl font-bold tabular-nums">≤ 1.0%</div>
              <div className="text-fg-subtle mt-1 font-sans text-xs">Hard Risk Cap</div>
            </div>
            <div className="pl-6">
              <div className="text-fg text-xl font-bold tabular-nums">AES-256</div>
              <div className="text-fg-subtle mt-1 font-sans text-xs">BYOK Key Vault</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
