'use client';

// SPDX-License-Identifier: Apache-2.0

// Architecture detail console for the selected stack layer: renders a bespoke
// 1px SVG subsystem schematic, 1-sentence summary, and 2x2 tabular spec grid.
import { IconLayersLinked } from '@tabler/icons-react';
import { AnimatePresence, m } from 'motion/react';

import type { LayerSpec } from './layers';

interface ArchitectureTelemetryConsoleProps {
  activeLayer: LayerSpec;
}

function LayerSubsystemSvg({ layerId }: { layerId: LayerSpec['id'] }) {
  if (layerId === 'execution') {
    return (
      <svg
        viewBox="0 0 340 116"
        className="h-auto w-full select-none"
        role="img"
        aria-label="PostgreSQL RLS tenant isolation and alert dispatch schematic"
      >
        <rect x="14" y="22" width="114" height="72" rx="6" fill="#121417" stroke="rgba(63,158,61,0.45)" />
        <text x="71" y="46" textAnchor="middle" fill="#3f9e3d" fontSize="8.5" fontWeight="700" className="font-mono">
          POSTGRESQL 16
        </text>
        <text x="71" y="62" textAnchor="middle" fill="#f3f2ee" fontSize="9.5" fontWeight="700" className="font-mono">
          RLS TENANT GATE
        </text>
        <text x="71" y="77" textAnchor="middle" fill="rgba(255,255,255,0.45)" fontSize="8" className="font-mono">
          TOTP 2FA VERIFIED
        </text>

        <line x1="128" y1="58" x2="196" y2="30" stroke="#3f9e3d" strokeWidth="1.25" strokeDasharray="3 3" />
        <line x1="128" y1="58" x2="196" y2="58" stroke="#3f9e3d" strokeWidth="1.25" strokeDasharray="3 3" />
        <line x1="128" y1="58" x2="196" y2="86" stroke="#3f9e3d" strokeWidth="1.25" strokeDasharray="3 3" />

        {[
          { y: 18, label: 'TRADE JOURNAL LEDGER' },
          { y: 46, label: 'TELEGRAM BOT WEBHOOK' },
          { y: 74, label: 'WEB PUSH & EMAIL' },
        ].map((out) => (
          <g key={out.label}>
            <rect x="196" y={out.y} width="130" height="24" rx="4" fill="#121417" stroke="rgba(255,255,255,0.1)" />
            <text x="261" y={out.y + 15} textAnchor="middle" fill="#f3f2ee" fontSize="8.5" fontWeight="700" className="font-mono">
              {out.label}
            </text>
          </g>
        ))}
      </svg>
    );
  }

  if (layerId === 'risk') {
    return (
      <svg
        viewBox="0 0 340 116"
        className="h-auto w-full select-none"
        role="img"
        aria-label="AES-256-GCM BYOK key vault and integer-cent spend ledger schematic"
      >
        <rect x="14" y="24" width="134" height="68" rx="6" fill="#121417" stroke="rgba(245,166,35,0.45)" />
        <text x="81" y="47" textAnchor="middle" fill="#f5a623" fontSize="8.5" fontWeight="700" className="font-mono">
          AES-256-GCM VAULT
        </text>
        <text x="81" y="63" textAnchor="middle" fill="#f3f2ee" fontSize="9.5" fontWeight="700" className="font-mono">
          BYOK CIPHERTEXT
        </text>
        <text x="81" y="78" textAnchor="middle" fill="rgba(255,255,255,0.45)" fontSize="8" className="font-mono">
          IN-MEMORY DECRYPT
        </text>

        <line x1="148" y1="58" x2="192" y2="58" stroke="#f5a623" strokeWidth="1.5" />
        <circle cx="170" cy="58" r="4" fill="#ff3616" />

        <rect x="192" y="24" width="134" height="68" rx="6" fill="#121417" stroke="rgba(255,54,22,0.45)" />
        <text x="259" y="47" textAnchor="middle" fill="#ff3616" fontSize="8.5" fontWeight="700" className="font-mono">
          BUDGET LEDGER
        </text>
        <text x="259" y="63" textAnchor="middle" fill="#f3f2ee" fontSize="9.5" fontWeight="700" className="font-mono">
          INTEGER-CENT CAP
        </text>
        <text x="259" y="78" textAnchor="middle" fill="#3f9e3d" fontSize="8" fontWeight="700" className="font-mono">
          ATOMIC RESERVATION
        </text>
      </svg>
    );
  }

  if (layerId === 'deliberation') {
    return (
      <svg
        viewBox="0 0 340 116"
        className="h-auto w-full select-none"
        role="img"
        aria-label="Parallel 4-desk engine and hybrid pgvector RAG schematic"
      >
        {[22, 46, 70, 94].map((y, idx) => (
          <g key={y}>
            <rect x="14" y={y - 9} width="96" height="18" rx="3.5" fill="#121417" stroke="rgba(255,255,255,0.1)" />
            <text x="62" y={y + 3} textAnchor="middle" fill="#f3f2ee" fontSize="8" fontWeight="700" className="font-mono">
              0{idx + 1} DESK NODE
            </text>
            <path d={`M 110 ${y} C 142 ${y}, 148 58, 176 58`} fill="none" stroke="#ff3616" strokeWidth="1.2" />
          </g>
        ))}

        <polygon points="198,34 222,58 198,82 174,58" fill="#191212" stroke="#ff3616" strokeWidth="1.5" />
        <text x="198" y="61" textAnchor="middle" fill="#ff3616" fontSize="8.5" fontWeight="700" className="font-mono">
          4/4
        </text>

        <line x1="222" y1="58" x2="246" y2="58" stroke="#3f9e3d" strokeWidth="1.5" />
        <rect x="246" y="34" width="80" height="48" rx="6" fill="#101813" stroke="rgba(63,158,61,0.45)" />
        <text x="286" y="55" textAnchor="middle" fill="#3f9e3d" fontSize="8.5" fontWeight="700" className="font-mono">
          FUSION SSE
        </text>
        <text x="286" y="69" textAnchor="middle" fill="#f3f2ee" fontSize="8" className="font-mono">
          + RAG RECALL
        </text>
      </svg>
    );
  }

  // layerId === 'ingestion'
  return (
    <svg
      viewBox="0 0 340 116"
      className="h-auto w-full select-none"
      role="img"
      aria-label="Multi-provider market data failover and L1/L2 SWR cache schematic"
    >
      {[
        { y: 24, name: 'BIQUOTE / BINANCE' },
        { y: 58, name: 'FRED / FINNHUB' },
        { y: 92, name: 'CFTC / MARKETAUX' },
      ].map((src) => (
        <g key={src.name}>
          <rect x="14" y={src.y - 11} width="124" height="22" rx="4" fill="#121417" stroke="rgba(255,255,255,0.1)" />
          <text x="76" y={src.y + 3} textAnchor="middle" fill="#f3f2ee" fontSize="8" fontWeight="700" className="font-mono">
            {src.name}
          </text>
          <path d={`M 138 ${src.y} C 168 ${src.y}, 174 58, 200 58`} fill="none" stroke="#38bdf8" strokeWidth="1.25" />
        </g>
      ))}

      <rect x="200" y="26" width="126" height="64" rx="6" fill="#10151b" stroke="rgba(56,189,248,0.45)" />
      <text x="263" y="49" textAnchor="middle" fill="#38bdf8" fontSize="8.5" fontWeight="700" className="font-mono">
        FAILOVER ROUTER
      </text>
      <text x="263" y="64" textAnchor="middle" fill="#f3f2ee" fontSize="9" fontWeight="700" className="font-mono">
        L1 / L2 SWR CACHE
      </text>
      <text x="263" y="78" textAnchor="middle" fill="#3f9e3d" fontSize="8" fontWeight="700" className="font-mono">
        STALENESS GUARD
      </text>
    </svg>
  );
}

export function ArchitectureTelemetryConsole({ activeLayer }: ArchitectureTelemetryConsoleProps) {
  const ActiveIcon = activeLayer.icon;

  return (
    <div className="surface-panel relative flex flex-col gap-4 overflow-hidden rounded-2xl border border-white/12 bg-[#141517]/95 p-5 shadow-2xl sm:p-6">
      <div className="relative z-10 flex items-center justify-between border-b border-white/[0.08] pb-3">
        <div className="flex items-center gap-2">
          <span className="bg-brand size-2 rounded-full shadow-[0_0_8px_#ff3616]" />
          <span className="text-brand font-mono text-[11px] font-bold tracking-[0.12em] uppercase">
            LAYER {activeLayer.num} · {activeLayer.tag}
          </span>
        </div>
        <div className="text-bull flex items-center gap-1 font-mono text-[11px]">
          <IconLayersLinked className="size-3.5" />
          <span>ISOLATED</span>
        </div>
      </div>

      <AnimatePresence mode="wait">
        <m.div
          key={activeLayer.id}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.16 }}
          className="relative z-10 flex flex-col gap-4"
        >
          {/* Subsystem 1px SVG Schematic */}
          <div className="overflow-hidden rounded-xl border border-white/[0.07] bg-[#090a0c] p-2">
            <LayerSubsystemSvg layerId={activeLayer.id} />
          </div>

          {/* Concise Layer Heading + Single-Sentence Summary */}
          <div>
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="text-brand font-mono text-[10px] font-semibold tracking-wider uppercase">
                {activeLayer.securityBadge}
              </span>
              <ActiveIcon className="text-brand size-4 shrink-0" />
            </div>
            <h3 className="font-display text-fg text-xl font-normal tracking-tight">
              {activeLayer.title}
            </h3>
            <p className="text-fg-muted mt-1 font-sans text-xs leading-relaxed">
              {activeLayer.fullDesc}
            </p>
          </div>

          {/* 2x2 Tabular Subsystem Spec Grid */}
          <div className="grid grid-cols-2 gap-2 border-t border-white/[0.07] pt-3 font-mono text-xs">
            {activeLayer.telemetry.map((t) => (
              <div
                key={t.label}
                className="rounded-lg border border-white/[0.05] bg-[#0b0c0e] px-2.5 py-2"
              >
                <span className="text-fg-subtle block truncate text-[10px] uppercase">
                  {t.label}
                </span>
                <span className="text-fg mt-0.5 block truncate text-[11px] font-bold">
                  {t.value}
                </span>
              </div>
            ))}
          </div>
        </m.div>
      </AnimatePresence>
    </div>
  );
}
