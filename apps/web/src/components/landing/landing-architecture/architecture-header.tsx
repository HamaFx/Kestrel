'use client';

// SPDX-License-Identifier: Apache-2.0

// Spacious section header for the self-hosted architecture overview.
export function ArchitectureHeader() {
  return (
    <div className="mb-16 flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
      <div>
        <div className="text-brand mb-3 font-mono text-xs font-semibold tracking-[0.14em] uppercase">
          04 · SELF-HOSTED ARCHITECTURE
        </div>
        <h2 className="font-display text-fg text-3xl font-normal tracking-[-0.02em] sm:text-5xl">
          Private by Design.{' '}
          <span className="font-redaction-35 text-brand italic">Built to Self-Host.</span>
        </h2>
      </div>
      <p className="text-fg-muted max-w-md font-sans text-base leading-relaxed">
        Kestrel runs on your own infrastructure with zero custodial risk—from multi-provider market
        failover and AES-256-GCM BYOK encryption to PostgreSQL Row-Level Security.
      </p>
    </div>
  );
}
