'use client';

// SPDX-License-Identifier: Apache-2.0

// Concise section header for the security & self-hosted architecture stack.
export function ArchitectureHeader() {
  return (
    <div className="mb-12 flex flex-col justify-between gap-4 border-b border-white/[0.07] pb-7 lg:flex-row lg:items-end">
      <div>
        <div className="text-brand mb-2.5 flex items-center gap-2 font-mono text-xs tracking-[0.14em] uppercase">
          <span>// 04 · SELF-HOSTED ARCHITECTURE</span>
        </div>
        <h2 className="font-display text-fg text-3xl font-normal tracking-[-0.02em] sm:text-5xl">
          Private by Design.{' '}
          <span className="font-redaction-35 text-brand italic">Built to Self-Host.</span>
        </h2>
      </div>
      <p className="text-fg-muted max-w-md font-sans text-sm leading-relaxed sm:text-base">
        Inspect Kestrel&apos;s four-layer sovereign stack—from multi-provider market ingestion and
        AES-256-GCM BYOK encryption to PostgreSQL Row-Level Security.
      </p>
    </div>
  );
}
