'use client';

// SPDX-License-Identifier: Apache-2.0

// Section header for the security & self-hosted architecture overview.
import { IconDatabase, IconKey, IconShieldLock } from '@tabler/icons-react';

const CORE_PILLARS = [
  {
    icon: IconKey,
    title: 'Encrypted API Keys',
    summary:
      'Your OpenAI, Anthropic, Google, and OpenRouter keys are encrypted at rest with AES-256-GCM and guarded by local spend caps.',
  },
  {
    icon: IconDatabase,
    title: 'Multi-Provider Market Data',
    summary:
      'Live Gold, Forex, Crypto, and Macro feeds with automatic health-scored failover and two-tier caching.',
  },
  {
    icon: IconShieldLock,
    title: 'Private Workspace',
    summary:
      '100% self-hosted and non-custodial with PostgreSQL row-level tenant isolation (RLS), TOTP 2FA, and a private trade journal.',
  },
] as const;

export function ArchitectureHeader() {
  return (
    <div className="mb-16 flex flex-col items-center gap-5 text-center">
      <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3.5 py-1 font-mono text-xs">
        <span className="bg-brand size-2 rounded-full" />
        <span className="text-brand font-semibold tracking-wider uppercase">
          Security &amp; Self-Hosted Architecture
        </span>
      </div>

      <h2 className="font-display text-fg max-w-3xl text-3xl font-normal tracking-[-0.03em] sm:text-5xl">
        PRIVATE BY DESIGN,{' '}
        <span className="font-redaction-35 text-brand italic">Built to Self-Host</span>
      </h2>
      <p className="text-fg-muted max-w-2xl font-sans text-sm leading-relaxed sm:text-base">
        Kestrel runs on your own infrastructure with zero custodial risk. Your API keys, market data
        adapters, and trade journal stay encrypted and isolated inside your private workspace.
      </p>

      {/* 3 Core Architecture Pillars */}
      <div className="mt-4 grid w-full grid-cols-1 gap-4 text-left md:grid-cols-3">
        {CORE_PILLARS.map((pillar) => {
          const PillarIcon = pillar.icon;
          return (
            <div
              key={pillar.title}
              className="surface-well flex flex-col gap-2.5 rounded-2xl border border-white/10 bg-[#121314] p-5"
            >
              <div className="flex items-center gap-2.5">
                <div className="bg-brand/10 border-brand/30 text-brand flex size-9 items-center justify-center rounded-lg border">
                  <PillarIcon className="size-4" />
                </div>
                <h3 className="font-display text-fg text-lg font-normal tracking-tight">
                  {pillar.title}
                </h3>
              </div>
              <p className="text-fg-muted font-sans text-xs leading-relaxed sm:text-sm">
                {pillar.summary}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
