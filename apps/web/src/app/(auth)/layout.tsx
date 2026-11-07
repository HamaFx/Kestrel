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

// Institutional split auth gateway: the credential column on the left (with a
// responsive mobile Sovereign Plate banner on <lg viewports), and the
// interactive Horus / Obelisk / Arbiter 3-Layer Sovereign showcase + sample
// verified dossier on the right.
import { IconArrowLeft, IconShieldCheck } from '@tabler/icons-react';
import type { Metadata } from 'next';
import { Link } from 'next-view-transitions';

import { BlueprintPlate } from '@/components/brand/blueprint-plates';
import { KestrelBrand } from '@/components/brand/kestrel-brand';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Kestrel account',
};

const SAMPLE_DESKS = [
  { code: 'DESK-I', name: 'HORUS', read: 'US10Y −4.2bp · DXY 104.1', bias: 'BULL' },
  { code: 'DESK-II', name: 'ASTROLABE', read: 'PDH reclaim 94% · 4H EMA stack', bias: 'BULL' },
  { code: 'DESK-III', name: 'AEGIS', read: '1.00% cap · ATR-14 stop', bias: 'GUARD' },
  { code: 'DESK-IV', name: 'SENTINEL', read: 'COT net +18.4K · retail short', bias: 'BULL' },
] as const;

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="bg-bg text-fg relative min-h-svh overflow-hidden lg:grid lg:grid-cols-12">
      {/* ── Credential column ── */}
      <section className="relative z-10 flex min-h-svh flex-col justify-between p-6 sm:p-10 lg:col-span-5 lg:border-r lg:border-white/[0.08]">
        <div className="flex items-center justify-between gap-4">
          <KestrelBrand variant="lockup" href="/landing" />
          <Link
            href="/landing"
            className="text-fg-subtle hover:text-fg inline-flex items-center gap-1.5 font-mono text-[11px] transition-colors active:translate-y-[0.5px]"
          >
            <IconArrowLeft className="text-brand size-3.5" />
            <span className="hidden sm:inline">Back to Kestrel</span>
          </Link>
        </div>

        {/* Mobile Sovereign Plate Showcase (visible on <lg screens) */}
        <div className="mt-6 lg:hidden">
          <BlueprintPlate
            id="horus"
            variant="showcase"
            showRasterBackup
            allowLayerToggle
            className="h-44 w-full"
          />
        </div>

        <h1 className="sr-only">Kestrel</h1>
        <div className="mx-auto w-full max-w-sm py-8 lg:py-10">{children}</div>

        <p className="text-fg-subtle/70 font-mono text-[9px] tracking-[0.14em]">
          NON-CUSTODIAL · AES-256-GCM BYOK VAULT · ROW-LEVEL SECURITY
        </p>
      </section>

      {/* ── Architecture column (Desktop) ── */}
      <aside className="relative hidden overflow-hidden border-l border-white/[0.06] bg-[#0c0d0f] p-10 lg:col-span-7 lg:flex lg:flex-col lg:justify-between xl:p-12">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-85">
          <BlueprintPlate id="horus" showRasterBackup className="h-full w-full" />
        </div>

        <div className="relative z-10 flex items-center justify-between gap-4">
          <span className="text-fg-subtle font-mono text-[10px] tracking-[0.2em] uppercase">
            Sovereign Council Architecture // 4 Specialist Desks
          </span>
          <span className="border-border/60 text-fg-subtle rounded border px-2 py-0.5 font-mono text-[9px] tracking-wider">
            SYSTEM / 4A
          </span>
        </div>

        <div className="relative z-10 my-auto flex flex-col gap-5">
          <BlueprintPlate
            id="arbiter"
            variant="showcase"
            showRasterBackup
            allowLayerToggle
            className="h-[240px] w-full max-w-xl self-end shadow-2xl"
          />

          <div className="w-full max-w-md self-end rounded-2xl border border-white/[0.1] bg-[#121315]/90 p-4 shadow-2xl backdrop-blur-md sm:p-5">
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
              <div className="flex items-center gap-2">
                <span className="bg-bull size-2 rounded-full" />
                <span className="text-fg font-mono text-[11px] font-bold tracking-wider uppercase">
                  Sample Verified Dossier
                </span>
              </div>
              <span className="text-brand border-brand/30 bg-brand/10 rounded border px-1.5 py-0.5 font-mono text-[9px] font-bold">
                #KSL-4A9F
              </span>
            </div>

            <div className="divide-y divide-white/[0.06]">
              {SAMPLE_DESKS.map((desk) => (
                <div
                  key={desk.code}
                  className="grid grid-cols-[52px_1fr_auto] items-center gap-2 py-2"
                >
                  <span className="text-fg-subtle font-mono text-[9px] tracking-wider">
                    {desk.code}
                  </span>
                  <span className="text-fg-muted min-w-0 truncate font-mono text-[10px]">
                    <span className="text-fg font-semibold">{desk.name}</span>
                    <span className="text-fg-subtle/60 mx-1">·</span>
                    {desk.read}
                  </span>
                  <span
                    className={
                      desk.bias === 'GUARD'
                        ? 'border-warn/30 bg-warn/10 text-warn rounded border px-1.5 py-0.5 font-mono text-[9px] font-bold'
                        : 'border-bull/30 bg-bull/10 text-bull rounded border px-1.5 py-0.5 font-mono text-[9px] font-bold'
                    }
                  >
                    {desk.bias}
                  </span>
                </div>
              ))}
            </div>

            <div className="border-brand/25 bg-brand/[0.05] mt-3 flex items-center justify-between gap-2 rounded-lg border px-3 py-2">
              <span className="text-fg-muted flex items-center gap-1.5 font-mono text-[10px]">
                <IconShieldCheck className="text-brand size-3.5" />
                IMMUTABLE RISK GUARDRAIL
              </span>
              <span className="text-brand font-mono text-xs font-bold tabular-nums">1.00%</span>
            </div>
          </div>
        </div>

        <p className="text-fg-subtle/60 relative z-10 font-mono text-[9px] tracking-wider">
          ILLUSTRATIVE COUNCIL OUTPUT · NOT A LIVE SIGNAL
        </p>
      </aside>
    </main>
  );
}
