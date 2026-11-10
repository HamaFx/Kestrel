'use client';

// SPDX-License-Identifier: Apache-2.0

// 3-Layer Sovereign Blueprint Plate System:
//   Layer 1A: Primary chiaroscuro `.webp` classical sculpture engraving
//   Layer 1B: Paired companion `.webp` engraving + 3px micro-pixel halftone screen
//   Layer 2 : Kinetic Precision CAD SVG blueprint reticle (counter-rotating
//             degree tick rings, meridian sweep, glowing tracer paths, sonar nodes)
//   Layer 3 : Live monospace telemetry matrix strip
import Image from 'next/image';
import { useState } from 'react';

import { cn } from '@/lib/formatters/cn';

import {
  PALETTE,
  PLATE_ASCII_MATRIX,
  PLATE_GEOMETRY,
  PLATE_LABEL,
  PLATE_SUBTITLE,
  RASTER_BACKUP,
  SECONDARY_RASTER_BACKUP,
  type BlueprintPlateId,
  type LabelSpec,
  type PlateGeometry,
  type Shape,
  type TickSpec,
} from './blueprint-geometry';

export {
  PLATE_ASCII_MATRIX,
  PLATE_LABEL,
  PLATE_SUBTITLE,
  RASTER_BACKUP,
  SECONDARY_RASTER_BACKUP,
  type BlueprintPlateId,
} from './blueprint-geometry';

export type BlueprintLayerMode = 'blended' | 'primary' | 'paired' | 'cad';

const RASTER_BACKDROP_CLASS: Record<BlueprintPlateId, string> = {
  horus: 'object-contain object-right-top brightness-[0.95] contrast-[1.24] lg:object-right',
  astrolabe: 'object-contain object-right-top brightness-[0.95] contrast-[1.24]',
  aegis: 'object-contain object-center brightness-[0.90] contrast-[1.30] grayscale',
  sentinel:
    'object-contain object-left-top brightness-[0.95] contrast-[1.24] lg:object-cover lg:object-left',
  arbiter: 'object-contain object-center brightness-[0.95] contrast-[1.24]',
  warroom: 'object-contain object-center brightness-[0.95] contrast-[1.24]',
  eclipse: 'object-contain object-center brightness-[0.95] contrast-[1.24]',
  obelisk: 'object-contain object-center brightness-[0.95] contrast-[1.24]',
  colonnade: 'object-contain object-left-top brightness-[0.95] contrast-[1.24]',
  titan:
    'object-contain object-right-top brightness-[0.95] contrast-[1.24] lg:object-cover lg:object-right',
};

const RASTER_WATERMARK_CLASS: Record<BlueprintPlateId, string> = {
  horus: 'object-cover object-[76%_35%] brightness-[0.92] contrast-[1.25]',
  astrolabe: 'object-cover object-[74%_48%] brightness-[0.92] contrast-[1.25]',
  aegis: 'object-cover object-[50%_34%] brightness-[0.88] contrast-[1.32] grayscale',
  sentinel: 'object-cover object-[28%_38%] brightness-[0.92] contrast-[1.25]',
  arbiter: 'object-cover object-center brightness-[0.92] contrast-[1.25]',
  warroom: 'object-cover object-center brightness-[0.92] contrast-[1.25]',
  eclipse: 'object-cover object-[58%_42%] brightness-[0.92] contrast-[1.25]',
  obelisk: 'object-cover object-center brightness-[0.92] contrast-[1.25]',
  colonnade: 'object-cover object-[28%_45%] brightness-[0.92] contrast-[1.25]',
  titan: 'object-cover object-[74%_40%] brightness-[0.92] contrast-[1.25]',
};

const WATERMARK_RADIAL_MASK =
  '[mask-image:radial-gradient(ellipse_74%_72%_at_52%_50%,rgba(0,0,0,1)_22%,rgba(0,0,0,0.72)_50%,rgba(0,0,0,0.22)_72%,transparent_86%)] [-webkit-mask-image:radial-gradient(ellipse_74%_72%_at_52%_50%,rgba(0,0,0,1)_22%,rgba(0,0,0,0.72)_50%,rgba(0,0,0,0.22)_72%,transparent_86%)]';

const BACKDROP_RADIAL_MASK =
  '[mask-image:radial-gradient(ellipse_80%_76%_at_54%_46%,rgba(0,0,0,1)_28%,rgba(0,0,0,0.78)_56%,rgba(0,0,0,0.24)_76%,transparent_90%)] [-webkit-mask-image:radial-gradient(ellipse_80%_76%_at_54%_46%,rgba(0,0,0,1)_28%,rgba(0,0,0,0.78)_56%,rgba(0,0,0,0.24)_76%,transparent_90%)]';

export function getArtworkWatermarkClass(artworkPath: string): string {
  if (artworkPath.includes('aegis-spartan-bust')) return cn(RASTER_WATERMARK_CLASS.aegis, WATERMARK_RADIAL_MASK);
  if (artworkPath.includes('desks-council-strategists')) return cn(RASTER_WATERMARK_CLASS.sentinel, WATERMARK_RADIAL_MASK);
  if (artworkPath.includes('kestrel-horus-statue')) return cn(RASTER_WATERMARK_CLASS.horus, WATERMARK_RADIAL_MASK);
  if (artworkPath.includes('simulator-astrolabe')) return cn(RASTER_WATERMARK_CLASS.astrolabe, WATERMARK_RADIAL_MASK);
  return cn(RASTER_WATERMARK_CLASS.arbiter, WATERMARK_RADIAL_MASK);
}

const round = (n: number) => Number(n.toFixed(2));

function polar(radius: number, degrees: number): [number, number] {
  const rad = ((degrees - 90) * Math.PI) / 180;
  return [round(200 + radius * Math.cos(rad)), round(200 + radius * Math.sin(rad))];
}

function TickRing({
  radius,
  count,
  length,
  offset = 0,
  color,
  width,
  opacity,
  reverse = false,
}: TickSpec & { reverse?: boolean }) {
  return (
    <g opacity={opacity}>
      <animateTransform
        attributeName="transform"
        type="rotate"
        from={reverse ? '360 200 200' : '0 200 200'}
        to={reverse ? '0 200 200' : '360 200 200'}
        dur={reverse ? '76s' : '54s'}
        repeatCount="indefinite"
      />
      {Array.from({ length: count }, (_, i) => {
        const angle = (360 / count) * i + offset;
        const [x1, y1] = polar(radius, angle);
        const [x2, y2] = polar(radius - length, angle);
        return (
          <line
            key={i}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke={color ?? PALETTE.struct}
            strokeWidth={width ?? 0.55}
          />
        );
      })}
    </g>
  );
}

function ShapeNode({ shape }: { shape: Shape }) {
  const common = {
    stroke: shape.stroke,
    strokeWidth: shape.width,
    strokeDasharray: shape.dash,
    fill: shape.fill ?? 'none',
    fillOpacity: shape.fillOpacity,
    opacity: shape.opacity,
    transform: shape.transform,
  };
  if (shape.d) {
    return (
      <g>
        <path d={shape.d} {...common} />
        {shape.animated && (
          <path
            d={shape.d}
            fill="none"
            stroke={shape.stroke ?? PALETTE.bull}
            strokeWidth={(shape.width ?? 1.2) + 1}
            strokeDasharray="34 220"
            strokeLinecap="round"
          >
            <animate attributeName="stroke-dashoffset" from="254" to="0" dur="3.8s" repeatCount="indefinite" />
          </path>
        )}
      </g>
    );
  }
  if (shape.points) return <polygon points={shape.points} {...common} />;
  if (shape.cx !== undefined && shape.r !== undefined) {
    const isBeacon = (shape.fill === PALETTE.brand || shape.fill === PALETTE.bull) && shape.r <= 4.5;
    return (
      <g>
        {isBeacon && (
          <circle cx={shape.cx} cy={shape.cy} r={shape.r} fill="none" stroke={shape.fill} strokeWidth="0.9">
            <animate attributeName="r" values="3.5;13" dur="2.4s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.75;0" dur="2.4s" repeatCount="indefinite" />
          </circle>
        )}
        <circle cx={shape.cx} cy={shape.cy} r={shape.r} {...common} />
      </g>
    );
  }
  if (shape.cx !== undefined && shape.rx !== undefined) {
    return <ellipse cx={shape.cx} cy={shape.cy} rx={shape.rx} ry={shape.ry} {...common} />;
  }
  if (shape.x1 !== undefined) {
    return <line x1={shape.x1} y1={shape.y1} x2={shape.x2} y2={shape.y2} {...common} />;
  }
  return <rect x={shape.x} y={shape.y} width={shape.w} height={shape.h} {...common} />;
}

function Label({ label }: { label: LabelSpec }) {
  return (
    <text
      x={label.x}
      y={label.y}
      fill={label.fill ?? PALETTE.callout}
      fontFamily={PALETTE.mono}
      fontSize="7.5"
      letterSpacing="0.8"
      textAnchor={label.anchor}
    >
      {label.text}
    </text>
  );
}

function PlateBody({ geometry }: { geometry: PlateGeometry }) {
  return (
    <g>
      {geometry.paths.map((s, i) => <ShapeNode key={`p${i}`} shape={s} />)}
      {geometry.polygons.map((s, i) => <ShapeNode key={`g${i}`} shape={s} />)}
      {geometry.ellipses.map((s, i) => <ShapeNode key={`e${i}`} shape={s} />)}
      {geometry.circles.map((s, i) => <ShapeNode key={`c${i}`} shape={s} />)}
      {geometry.lines.map((s, i) => <ShapeNode key={`l${i}`} shape={s} />)}
      {geometry.rects.map((s, i) => <ShapeNode key={`r${i}`} shape={s} />)}
      {geometry.ticks.map((t, i) => <TickRing key={i} {...t} reverse={i % 2 === 1} />)}
      {geometry.labels.map((label, i) => <Label key={i} label={label} />)}
    </g>
  );
}

function RegistrationFrame({ label }: { label: string }) {
  return (
    <g>
      <path
        d="M 18 34 V 18 H 34 M 366 18 H 382 V 34 M 382 366 V 382 H 366 M 34 382 H 18 V 366"
        stroke={PALETTE.struct}
        strokeWidth="0.9"
      />
      <circle cx="200" cy="200" r="172" stroke={PALETTE.ghost} strokeWidth="0.6" strokeDasharray="2 4" />
      <g opacity="0.38">
        <animateTransform
          attributeName="transform"
          type="rotate"
          from="0 200 200"
          to="360 200 200"
          dur="22s"
          repeatCount="indefinite"
        />
        <line x1="200" y1="200" x2="200" y2="34" stroke={PALETTE.brand} strokeWidth="0.75" strokeDasharray="3 4" />
        <circle cx="200" cy="34" r="2" fill={PALETTE.brand} />
      </g>
      <path d="M 200 10 V 22 M 200 378 V 390 M 10 200 H 22 M 378 200 H 390" stroke={PALETTE.ghost} />
      <text x="26" y="46" fill={PALETTE.callout} fontFamily={PALETTE.mono} fontSize="7.5" letterSpacing="1.3">
        {label}
      </text>
      <text x="374" y="46" fill={PALETTE.callout} fontFamily={PALETTE.mono} fontSize="7.5" textAnchor="end">
        CAD 400×400
      </text>
    </g>
  );
}

const LAYER_MODES: Array<{ id: BlueprintLayerMode; label: string }> = [
  { id: 'blended', label: '3-LAYER BLEND' },
  { id: 'primary', label: 'SCULPTURE I' },
  { id: 'paired', label: 'SCULPTURE II' },
  { id: 'cad', label: 'CAD RETICLE' },
];

export interface BlueprintPlateProps {
  id: BlueprintPlateId;
  className?: string;
  interactive?: boolean;
  showRasterBackup?: boolean;
  variant?: 'backdrop' | 'watermark' | 'showcase' | 'compact' | 'ambient';
  showAsciiStrip?: boolean;
  allowLayerToggle?: boolean;
}

export function BlueprintPlate({
  id,
  className,
  variant = 'watermark',
  showAsciiStrip,
  allowLayerToggle = false,
}: BlueprintPlateProps) {
  const [layerMode, setLayerMode] = useState<BlueprintLayerMode>('blended');
  const isShowcase = variant === 'showcase';
  const isCompact = variant === 'compact';
  const isBackdrop = variant === 'backdrop';
  const displayAscii = showAsciiStrip ?? isShowcase;

  const showPrimaryRaster = layerMode === 'blended' || layerMode === 'primary';
  const showPairedRaster = (isShowcase || isCompact) && (layerMode === 'blended' || layerMode === 'paired');
  const showCadSvg = (isShowcase || isCompact || isBackdrop) && (layerMode === 'blended' || layerMode === 'cad');
  const asciiLines = PLATE_ASCII_MATRIX[id];

  return (
    <div
      className={cn(
        'relative isolate overflow-hidden select-none',
        !allowLayerToggle && 'pointer-events-none',
        isBackdrop && BACKDROP_RADIAL_MASK,
        variant === 'watermark' && WATERMARK_RADIAL_MASK,
        isShowcase && 'rounded-xl border border-white/12 bg-[#0a0b0d] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]',
        isCompact && 'rounded-xl border border-white/[0.08] bg-[#0a0b0d]',
        className,
      )}
      data-blueprint={id}
      aria-hidden={!allowLayerToggle}
    >
      {showPrimaryRaster && (
        <Image
          src={RASTER_BACKUP[id]}
          alt=""
          fill
          unoptimized
          priority={id === 'horus'}
          sizes={isBackdrop ? '(max-width: 1024px) 100vw, 56vw' : '(max-width: 768px) 100vw, 420px'}
          className={cn(
            'transition-opacity duration-300',
            isBackdrop ? RASTER_BACKDROP_CLASS[id] : RASTER_WATERMARK_CLASS[id],
            layerMode === 'primary'
              ? 'opacity-90 mix-blend-normal'
              : isShowcase || isCompact
                ? 'opacity-62 mix-blend-lighten [mask-image:radial-gradient(ellipse_84%_80%_at_50%_48%,black_45%,transparent_96%)]'
                : 'mix-blend-screen',
          )}
        />
      )}

      {showPairedRaster && (
        <Image
          src={SECONDARY_RASTER_BACKUP[id]}
          alt=""
          fill
          unoptimized
          sizes="(max-width: 768px) 100vw, 420px"
          className={cn(
            'object-cover transition-opacity duration-300 [mask-image:radial-gradient(ellipse_75%_72%_at_50%_50%,black_35%,transparent_95%)]',
            layerMode === 'paired' ? 'opacity-88 mix-blend-normal' : 'opacity-26 mix-blend-screen',
          )}
        />
      )}

      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-[4]"
        style={{
          backgroundImage: 'radial-gradient(rgba(10, 11, 13, 0.44) 1px, transparent 1px)',
          backgroundSize: '3px 3px',
        }}
      />

      {(isShowcase || isCompact) && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-[5] bg-gradient-to-t from-[#08090b] via-transparent to-[#08090b]/65"
        />
      )}

      {allowLayerToggle && (
        <div className="relative z-20 flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.08] bg-[#0b0c0e]/90 px-3 py-1.5 backdrop-blur-md">
          <div className="flex min-w-0 items-center gap-2">
            <span className="bg-brand size-1.5 shrink-0 rounded-full shadow-[0_0_8px_#ff3616]" />
            <span className="text-fg truncate font-mono text-[10px] font-semibold tracking-wider uppercase">
              {PLATE_LABEL[id]}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-1">
            {LAYER_MODES.map((mode) => {
              const active = layerMode === mode.id;
              return (
                <button
                  key={mode.id}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setLayerMode(mode.id);
                  }}
                  className={cn(
                    'rounded border px-1.5 py-0.5 font-mono text-[9px] font-semibold tracking-wider uppercase transition-colors',
                    active
                      ? 'border-brand/50 bg-brand/15 text-brand'
                      : 'text-fg-subtle hover:text-fg border-white/10 bg-white/[0.03]',
                  )}
                >
                  {mode.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {showCadSvg && (
        <svg
          viewBox="0 0 400 400"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
          preserveAspectRatio="xMidYMid meet"
          className={cn(
            'relative z-10 block h-full w-full',
            isBackdrop && 'opacity-38',
            isShowcase && allowLayerToggle && 'h-[calc(100%-32px)]',
          )}
          focusable="false"
        >
          <RegistrationFrame label={PLATE_LABEL[id]} />
          <PlateBody geometry={PLATE_GEOMETRY[id]} />
        </svg>
      )}

      {displayAscii && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 border-t border-white/[0.08] bg-[#08090b]/92 px-3 py-1.5 font-mono backdrop-blur-sm">
          <div className="text-brand truncate text-[9px] leading-tight font-semibold tracking-wider">
            {asciiLines[0]}
          </div>
          <div className="text-fg-muted mt-0.5 truncate text-[9px] leading-tight tracking-wider">
            {asciiLines[1]}
          </div>
        </div>
      )}
    </div>
  );
}
