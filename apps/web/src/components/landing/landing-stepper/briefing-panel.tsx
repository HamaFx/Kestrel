'use client';

// SPDX-License-Identifier: Apache-2.0

// Right-column interactive SVG pipeline schematic for the landing stepper.
// Replaces the legacy <pre><code> text dump and 6 sub-cards with a bespoke
// 3-stage vector visualizer (Ingest -> Deliberate -> Dispatch) and 3 metric chips.
import { IconPlayerPause, IconPlayerPlay } from '@tabler/icons-react';
import { m } from 'motion/react';

import { cn } from '@/lib/formatters/cn';

import { STEPS, type Step } from './steps';

interface BriefingPanelProps {
  currentStep: Step;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onSelectStep: (id: number) => void;
}

function StepPipelineSvg({ stepId }: { stepId: Step['id'] }) {
  if (stepId === 1) {
    const feeds = [
      { y: 48, source: 'BIQUOTE / BINANCE', detail: 'OHLCV · 1M / 1H / 4H', badge: '14ms' },
      { y: 124, source: 'FRED / FINNHUB', detail: 'US10Y · DXY · FOMC', badge: 'LIVE' },
      { y: 200, source: 'CFTC COT / NEWS', detail: 'MANAGED MONEY FLOW', badge: 'SYNC' },
    ] as const;

    return (
      <svg
        viewBox="0 0 540 248"
        className="h-auto w-full select-none"
        role="img"
        aria-label="Stage 1 multi-provider market and macro ingestion schematic"
      >
        <defs>
          <pattern id="step-grid-1" width="24" height="24" patternUnits="userSpaceOnUse">
            <path d="M 24 0 L 0 0 0 24" fill="none" stroke="rgba(255,255,255,0.035)" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="540" height="248" fill="url(#step-grid-1)" />

        {/* 3 Provider Source Nodes -> Central Data Envelope */}
        {feeds.map((feed, idx) => {
          const pathD = `M 188 ${feed.y} C 236 ${feed.y}, 244 124, 286 124`;
          return (
            <g key={feed.source}>
              <path d={pathD} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="1.25" />
              <m.path
                d={pathD}
                fill="none"
                stroke="#ff3616"
                strokeWidth="1.75"
                strokeDasharray="5 7"
                initial={{ strokeDashoffset: 24 }}
                animate={{ strokeDashoffset: 0 }}
                transition={{ duration: 1.7 + idx * 0.2, repeat: Infinity, ease: 'linear' }}
              />
              <rect
                x="16"
                y={feed.y - 22}
                width="172"
                height="44"
                rx="7"
                fill="#121417"
                stroke="rgba(255,255,255,0.1)"
              />
              <text x="28" y={feed.y - 4} fill="#f3f2ee" fontSize="9.5" fontWeight="700" className="font-mono">
                {feed.source}
              </text>
              <text x="28" y={feed.y + 11} fill="rgba(255,255,255,0.48)" fontSize="8.5" className="font-mono">
                {feed.detail}
              </text>
              <text
                x="176"
                y={feed.y - 4}
                textAnchor="end"
                fill="#3f9e3d"
                fontSize="8.5"
                fontWeight="700"
                className="font-mono"
              >
                {feed.badge}
              </text>
            </g>
          );
        })}

        {/* Normalized Snapshot Hub + Structure Preview */}
        <rect
          x="286"
          y="30"
          width="238"
          height="188"
          rx="10"
          fill="#101215"
          stroke="rgba(255,54,22,0.45)"
          strokeWidth="1.25"
        />
        <text x="302" y="52" fill="#ff3616" fontSize="9" fontWeight="700" className="font-mono">
          NORMALIZED SNAPSHOT · XAU/USD
        </text>
        <text x="508" y="52" textAnchor="end" fill="#f3f2ee" fontSize="10" fontWeight="700" className="font-mono">
          2,864.20
        </text>

        {/* ATR Volatility Channel & Structure Line inside Snapshot Hub */}
        <path
          d="M 302 154 C 348 148, 392 126, 434 114 C 464 106, 488 88, 508 78 L 508 118 C 488 128, 464 144, 434 152 C 392 164, 348 182, 302 188 Z"
          fill="rgba(255,54,22,0.09)"
        />
        <path
          d="M 302 172 L 336 162 L 368 176 L 404 138 L 438 144 L 474 108 L 508 94"
          fill="none"
          stroke="#f3f2ee"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <circle cx="508" cy="94" r="4" fill="#3f9e3d" />

        <line x1="302" y1="196" x2="508" y2="196" stroke="rgba(255,255,255,0.08)" />
        <text x="302" y="209" fill="rgba(255,255,255,0.5)" fontSize="8.5" className="font-mono">
          PDH 2,884.00 · PDL 2,846.50 · ATR 11.8
        </text>
      </svg>
    );
  }

  if (stepId === 2) {
    const desks = [
      { y: 38, code: '01 MACRO DESK', read: 'REAL YIELDS -4.2BP', score: '88%' },
      { y: 95, code: '02 TECH DESK', read: '4H HIGHER LOW HELD', score: '94%' },
      { y: 152, code: '03 RISK DESK', read: '0.85% ≤ 1.0% CAP', score: '92%' },
      { y: 209, code: '04 COT DESK', read: '+18.4K NET LONG', score: '86%' },
    ] as const;

    return (
      <svg
        viewBox="0 0 540 248"
        className="h-auto w-full select-none"
        role="img"
        aria-label="Stage 2 parallel 4-desk deliberation and numeric verifier gate schematic"
      >
        <defs>
          <pattern id="step-grid-2" width="24" height="24" patternUnits="userSpaceOnUse">
            <path d="M 24 0 L 0 0 0 24" fill="none" stroke="rgba(255,255,255,0.035)" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="540" height="248" fill="url(#step-grid-2)" />

        {desks.map((desk, idx) => {
          const pathD = `M 206 ${desk.y} C 258 ${desk.y}, 268 124, 316 124`;
          return (
            <g key={desk.code}>
              <path d={pathD} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="1.25" />
              <m.path
                d={pathD}
                fill="none"
                stroke="#ff3616"
                strokeWidth="1.75"
                strokeDasharray="6 6"
                initial={{ strokeDashoffset: 24 }}
                animate={{ strokeDashoffset: 0 }}
                transition={{ duration: 1.5 + idx * 0.15, repeat: Infinity, ease: 'linear' }}
              />
              <rect
                x="16"
                y={desk.y - 19}
                width="190"
                height="38"
                rx="6"
                fill="#121417"
                stroke="rgba(255,255,255,0.1)"
              />
              <text x="28" y={desk.y - 3} fill="#f3f2ee" fontSize="9.5" fontWeight="700" className="font-mono">
                {desk.code}
              </text>
              <text x="28" y={desk.y + 11} fill="rgba(255,255,255,0.48)" fontSize="8" className="font-mono">
                {desk.read}
              </text>
              <text
                x="194"
                y={desk.y + 4}
                textAnchor="end"
                fill="#3f9e3d"
                fontSize="10"
                fontWeight="700"
                className="font-mono"
              >
                {desk.score}
              </text>
            </g>
          );
        })}

        {/* Central 4/4 Numeric Verifier Gate */}
        <g transform="translate(348, 124)">
          <m.circle
            r="36"
            fill="none"
            stroke="rgba(255,54,22,0.3)"
            strokeWidth="1.2"
            animate={{ scale: [1, 1.12, 1], opacity: [0.7, 0.2, 0.7] }}
            transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
          />
          <polygon
            points="0,-30 30,0 0,30 -30,0"
            fill="#191212"
            stroke="#ff3616"
            strokeWidth="1.75"
          />
          <text x="0" y="-3" textAnchor="middle" fill="#ff3616" fontSize="10" fontWeight="700" className="font-mono">
            4 / 4
          </text>
          <text x="0" y="9" textAnchor="middle" fill="#f3f2ee" fontSize="8" className="font-mono">
            VERIFIED
          </text>
        </g>

        {/* Verified Consensus Output Node */}
        <line x1="378" y1="124" x2="412" y2="124" stroke="#3f9e3d" strokeWidth="2" />
        <rect
          x="412"
          y="78"
          width="112"
          height="92"
          rx="8"
          fill="#101813"
          stroke="rgba(63,158,61,0.5)"
          strokeWidth="1.25"
        />
        <text x="468" y="102" textAnchor="middle" fill="#3f9e3d" fontSize="9" fontWeight="700" className="font-mono">
          BUY / LONG
        </text>
        <text x="468" y="128" textAnchor="middle" fill="#f3f2ee" fontSize="20" fontWeight="700" className="font-mono">
          91%
        </text>
        <text x="468" y="148" textAnchor="middle" fill="rgba(255,255,255,0.55)" fontSize="8.5" className="font-mono">
          1:3.22 R:R
        </text>
      </svg>
    );
  }

  // stepId === 3: Verified Bracket & Multi-Channel Alert Dispatch
  const targets = [
    { y: 52, title: 'TRADE JOURNAL LEDGER', sub: 'R-MULTIPLE & EQUITY CURVE LOGGED', tone: '#3f9e3d' },
    { y: 124, title: 'TELEGRAM BOT WEBHOOK', sub: 'ENTRY / SL / TP1 TRIGGERS ARMED', tone: '#ff3616' },
    { y: 196, title: 'BROWSER PUSH & EMAIL', sub: 'REAL-TIME INVALIDATION ALERTS', tone: '#f3f2ee' },
  ] as const;

  return (
    <svg
      viewBox="0 0 540 248"
      className="h-auto w-full select-none"
      role="img"
      aria-label="Stage 3 verified trade bracket and multi-channel alert dispatch schematic"
    >
      <defs>
        <pattern id="step-grid-3" width="24" height="24" patternUnits="userSpaceOnUse">
          <path d="M 24 0 L 0 0 0 24" fill="none" stroke="rgba(255,255,255,0.035)" strokeWidth="1" />
        </pattern>
      </defs>
      <rect width="540" height="248" fill="url(#step-grid-3)" />

      {/* Left Verified Bracket Card */}
      <rect
        x="16"
        y="34"
        width="210"
        height="180"
        rx="10"
        fill="#121417"
        stroke="rgba(255,54,22,0.45)"
        strokeWidth="1.25"
      />
      <text x="30" y="58" fill="#ff3616" fontSize="9" fontWeight="700" className="font-mono">
        VERIFIED BRACKET · XAU/USD
      </text>

      <rect x="28" y="70" width="186" height="36" rx="5" fill="rgba(63,158,61,0.12)" stroke="rgba(63,158,61,0.4)" />
      <text x="38" y="92" fill="#3f9e3d" fontSize="9.5" fontWeight="700" className="font-mono">
        TP1 2,884.00 · TP2 2,916.50
      </text>

      <rect x="28" y="114" width="186" height="36" rx="5" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.18)" />
      <text x="38" y="136" fill="#f3f2ee" fontSize="9.5" fontWeight="700" className="font-mono">
        ENTRY 2,864.20 (LIMIT)
      </text>

      <rect x="28" y="158" width="186" height="36" rx="5" fill="rgba(229,72,77,0.12)" stroke="rgba(229,72,77,0.4)" />
      <text x="38" y="180" fill="#e5484d" fontSize="9.5" fontWeight="700" className="font-mono">
        STOP 2,846.50 (0.85% RISK)
      </text>

      {/* Fan-out Dispatch Traces to 3 Channels */}
      {targets.map((channel, idx) => {
        const pathD = `M 226 124 C 272 124, 276 ${channel.y}, 318 ${channel.y}`;
        return (
          <g key={channel.title}>
            <path d={pathD} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="1.25" />
            <m.path
              d={pathD}
              fill="none"
              stroke={channel.tone}
              strokeWidth="1.75"
              strokeDasharray="5 6"
              initial={{ strokeDashoffset: 22 }}
              animate={{ strokeDashoffset: 0 }}
              transition={{ duration: 1.6 + idx * 0.2, repeat: Infinity, ease: 'linear' }}
            />
            <rect
              x="318"
              y={channel.y - 22}
              width="206"
              height="44"
              rx="7"
              fill="#121417"
              stroke="rgba(255,255,255,0.1)"
            />
            <circle cx="332" cy={channel.y - 4} r="3.2" fill={channel.tone} />
            <text x="342" y={channel.y - 1} fill="#f3f2ee" fontSize="9.5" fontWeight="700" className="font-mono">
              {channel.title}
            </text>
            <text x="330" y={channel.y + 13} fill="rgba(255,255,255,0.48)" fontSize="8" className="font-mono">
              {channel.sub}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function BriefingPanel({
  currentStep,
  isPlaying,
  onTogglePlay,
  onSelectStep,
}: BriefingPanelProps) {
  return (
    <div
      id="pipeline-detail-panel"
      role="tabpanel"
      aria-label={currentStep.title}
      className="surface-panel relative flex flex-col justify-between overflow-hidden rounded-2xl border border-white/12 bg-[#141517]/95 p-5 shadow-2xl sm:p-6 lg:col-span-7"
    >
      {/* Top Bar: Figure Code, Status Pill & Auto-Cycle Toggle */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.08] pb-3.5">
        <div className="flex items-center gap-2.5">
          <span className="bg-brand size-2 rounded-full shadow-[0_0_8px_#ff3616]" />
          <span className="text-fg font-mono text-[11px] font-bold tracking-[0.12em] uppercase">
            {currentStep.figureCode}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className="border-bull/30 bg-bull/10 text-bull rounded border px-2 py-0.5 font-mono text-[10px] font-bold tracking-wider uppercase">
            {currentStep.statusBadge}
          </span>
          <button
            type="button"
            onClick={onTogglePlay}
            className="text-fg-subtle hover:text-fg flex items-center gap-1 rounded border border-white/10 bg-black/40 px-2.5 py-1 font-mono text-[11px] transition-colors"
            aria-label={isPlaying ? 'Pause pipeline animation' : 'Play pipeline animation'}
          >
            {isPlaying ? <IconPlayerPause className="size-3.5" /> : <IconPlayerPlay className="size-3.5" />}
            <span>{isPlaying ? 'AUTO' : 'PAUSED'}</span>
          </button>
        </div>
      </div>

      {/* Centerpiece Interactive SVG Pipeline Schematic */}
      <div className="my-4 overflow-hidden rounded-xl border border-white/[0.07] bg-[#090a0c] p-2">
        <StepPipelineSvg stepId={currentStep.id} />
      </div>

      {/* Bottom 3 Tabular Spec Chips + Stage Dots */}
      <div>
        <div className="grid grid-cols-1 gap-2.5 font-mono sm:grid-cols-3">
          {currentStep.metrics.map((metric) => (
            <div
              key={metric.label}
              className="rounded-lg border border-white/[0.06] bg-[#0b0c0e] px-3 py-2.5"
            >
              <span className="text-fg-subtle block text-[10px] tracking-wider uppercase">
                {metric.label}
              </span>
              <span
                className={cn(
                  'mt-0.5 block text-xs font-bold tabular-nums',
                  metric.tone === 'bull'
                    ? 'text-bull'
                    : metric.tone === 'brand'
                      ? 'text-brand'
                      : 'text-fg',
                )}
              >
                {metric.value}
              </span>
            </div>
          ))}
        </div>

        <div className="mt-4 flex items-center justify-between border-t border-white/[0.07] pt-3 font-mono text-[11px]">
          <span className="text-fg-subtle">
            STAGE 0{currentStep.id} OF 03 · {currentStep.title.toUpperCase()}
          </span>
          <div className="flex items-center gap-1.5">
            {STEPS.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => onSelectStep(s.id)}
                aria-label={`Select stage ${s.id}`}
                className={cn(
                  'h-1.5 rounded-full transition-all',
                  s.id === currentStep.id ? 'bg-brand w-6' : 'w-2 bg-white/20 hover:bg-white/40',
                )}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
