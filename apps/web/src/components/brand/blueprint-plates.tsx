'use client';

// SPDX-License-Identifier: Apache-2.0

// 3-Layer Sovereign Blueprint Plate System:
//   Layer 1A: Primary chiaroscuro halftone `.webp` engraving
//   Layer 1B: Paired companion `.webp` engraving (blends original 9 + new 4 assets)
//   Layer 2 : Precision CAD SVG blueprint reticle (0.75px hairlines + #FF3616 node)
//   Layer 3 : Live monospace ASCII halftone & telemetry strip
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

export type BlueprintLayerMode = 'blended' | 'primary' | 'paired' | 'cad' | 'ascii';

const round = (n: number) => Number(n.toFixed(2));

function polar(radius: number, degrees: number): [number, number] {
  const rad = ((degrees - 90) * Math.PI) / 180;
  return [round(200 + radius * Math.cos(rad)), round(200 + radius * Math.sin(rad))];
}

function TickRing({ radius, count, length, offset = 0, color, width, opacity }: TickSpec) {
  return (
    <g opacity={opacity}>
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
            strokeWidth={width ?? 0.5}
          />
        );
      })}
    </g>
  );
}

function ShapeNode({ shape, index }: { shape: Shape; index: number }) {
  const common = {
    stroke: shape.stroke,
    strokeWidth: shape.width,
    strokeDasharray: shape.dash,
    fill: shape.fill ?? 'none',
    fillOpacity: shape.fillOpacity,
    opacity: shape.opacity,
    transform: shape.transform,
  };
  if (shape.d) return <path key={index} d={shape.d} {...common} />;
  if (shape.points) return <polygon key={index} points={shape.points} {...common} />;
  if (shape.cx !== undefined && shape.r !== undefined) {
    return <circle key={index} cx={shape.cx} cy={shape.cy} r={shape.r} {...common} />;
  }
  if (shape.cx !== undefined && shape.rx !== undefined) {
    return (
      <ellipse key={index} cx={shape.cx} cy={shape.cy} rx={shape.rx} ry={shape.ry} {...common} />
    );
  }
  if (shape.x1 !== undefined) {
    return <line key={index} x1={shape.x1} y1={shape.y1} x2={shape.x2} y2={shape.y2} {...common} />;
  }
  return <rect key={index} x={shape.x} y={shape.y} width={shape.w} height={shape.h} {...common} />;
}

function Label({ label }: { label: LabelSpec }) {
  return (
    <text
      x={label.x}
      y={label.y}
      fill={label.fill ?? PALETTE.callout}
      fontFamily={PALETTE.mono}
      fontSize="7"
      textAnchor={label.anchor}
    >
      {label.text}
    </text>
  );
}

function PlateBody({ geometry }: { geometry: PlateGeometry }) {
  return (
    <g>
      {geometry.paths.map((s, i) => (
        <ShapeNode key={`p${i}`} shape={s} index={i} />
      ))}
      {geometry.polygons.map((s, i) => (
        <ShapeNode key={`g${i}`} shape={s} index={i} />
      ))}
      {geometry.ellipses.map((s, i) => (
        <ShapeNode key={`e${i}`} shape={s} index={i} />
      ))}
      {geometry.circles.map((s, i) => (
        <ShapeNode key={`c${i}`} shape={s} index={i} />
      ))}
      {geometry.lines.map((s, i) => (
        <ShapeNode key={`l${i}`} shape={s} index={i} />
      ))}
      {geometry.rects.map((s, i) => (
        <ShapeNode key={`r${i}`} shape={s} index={i} />
      ))}
      {geometry.ticks.map((t, i) => (
        <TickRing key={i} {...t} />
      ))}
      {geometry.labels.map((label, i) => (
        <Label key={i} label={label} />
      ))}
    </g>
  );
}

function RegistrationFrame({ label }: { label: string }) {
  return (
    <g>
      <path
        d="M 18 32 V 18 H 32 M 368 18 H 382 V 32 M 382 368 V 382 H 368 M 32 382 H 18 V 368"
        stroke={PALETTE.struct}
        strokeWidth="0.75"
      />
      <circle
        cx="200"
        cy="200"
        r="172"
        stroke={PALETTE.ghost}
        strokeWidth="0.5"
        strokeDasharray="2 4"
      />
      <path
        d="M 200 12 V 22 M 200 378 V 388 M 12 200 H 22 M 378 200 H 388"
        stroke={PALETTE.ghost}
      />
      <text
        x="24"
        y="48"
        fill={PALETTE.callout}
        fontFamily={PALETTE.mono}
        fontSize="7"
        letterSpacing="1.4"
      >
        {label}
      </text>
      <text
        x="376"
        y="48"
        fill={PALETTE.callout}
        fontFamily={PALETTE.mono}
        fontSize="7"
        textAnchor="end"
      >
        400 / 400
      </text>
      <text x="24" y="360" fill={PALETTE.callout} fontFamily={PALETTE.mono} fontSize="7">
        KESTREL · 3-LAYER PLATE
      </text>
      <text
        x="376"
        y="360"
        fill={PALETTE.callout}
        fontFamily={PALETTE.mono}
        fontSize="7"
        textAnchor="end"
      >
        SCALE 1:1
      </text>
    </g>
  );
}

const LAYER_MODES: Array<{ id: BlueprintLayerMode; label: string }> = [
  { id: 'blended', label: '3-LAYER BLEND' },
  { id: 'primary', label: 'PLATE I' },
  { id: 'paired', label: 'PLATE II' },
  { id: 'cad', label: 'CAD SVG' },
  { id: 'ascii', label: 'ASCII' },
];

export interface BlueprintPlateProps {
  id: BlueprintPlateId;
  className?: string;
  interactive?: boolean;
  /** Layer the chiaroscuro `.webp` engravings under the CAD SVG reticle. */
  showRasterBackup?: boolean;
  /** Render the interactive 3-Layer Sovereign Plate switcher + ASCII strip. */
  variant?: 'ambient' | 'showcase' | 'compact';
  /** Explicitly show or hide the bottom ASCII telemetry strip. */
  showAsciiStrip?: boolean;
  /** Enable interactive layer mode pill buttons on showcase plates. */
  allowLayerToggle?: boolean;
}

export function BlueprintPlate({
  id,
  className,
  interactive = false,
  showRasterBackup = false,
  variant = 'ambient',
  showAsciiStrip,
  allowLayerToggle = false,
}: BlueprintPlateProps) {
  const [layerMode, setLayerMode] = useState<BlueprintLayerMode>('blended');
  const isShowcase = variant === 'showcase';
  const isCompact = variant === 'compact';
  const displayAscii = showAsciiStrip ?? (isShowcase || isCompact);

  const showPrimaryRaster =
    (showRasterBackup || isShowcase || isCompact) &&
    (layerMode === 'blended' || layerMode === 'primary');
  const showPairedRaster =
    (showRasterBackup || isShowcase || isCompact) &&
    (layerMode === 'blended' || layerMode === 'paired');
  const showCadSvg = layerMode === 'blended' || layerMode === 'cad' || layerMode === 'ascii';

  const asciiLines = PLATE_ASCII_MATRIX[id];

  return (
    <div
      className={cn(
        'relative isolate overflow-hidden select-none',
        isShowcase &&
          'rounded-xl border border-white/10 bg-[#0a0b0d] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]',
        isCompact && 'rounded-lg border border-white/[0.08] bg-[#0b0c0e]',
        className,
      )}
      data-blueprint={id}
      aria-hidden={!allowLayerToggle}
    >
      {/* Layer 1A: Primary Chiaroscuro Halftone Engraving */}
      {showPrimaryRaster ? (
        <Image
          src={RASTER_BACKUP[id]}
          alt=""
          fill
          unoptimized
          sizes="(max-width: 1024px) 100vw, 48vw"
          className={cn(
            'object-cover transition-opacity duration-300 [mask-image:radial-gradient(ellipse_84%_80%_at_50%_46%,black_45%,transparent_98%)]',
            layerMode === 'primary'
              ? 'opacity-90 mix-blend-normal'
              : isShowcase
                ? 'opacity-65 mix-blend-lighten'
                : isCompact
                  ? 'opacity-60 mix-blend-lighten'
                  : 'opacity-45 mix-blend-lighten',
          )}
        />
      ) : null}

      {/* Layer 1B: Paired Companion Engraving (Blending Old + New Brand Assets) */}
      {showPairedRaster ? (
        <Image
          src={SECONDARY_RASTER_BACKUP[id]}
          alt=""
          fill
          unoptimized
          sizes="(max-width: 1024px) 100vw, 48vw"
          className={cn(
            'object-cover transition-opacity duration-300 [mask-image:radial-gradient(ellipse_75%_72%_at_50%_50%,black_35%,transparent_95%)]',
            layerMode === 'paired'
              ? 'opacity-90 mix-blend-normal'
              : isShowcase
                ? 'opacity-28 mix-blend-screen'
                : 'opacity-20 mix-blend-screen',
          )}
        />
      ) : null}

      {/* Subtle Halftone Burst & Vignette Gradient */}
      {(isShowcase || isCompact) && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-[5] bg-gradient-to-t from-[#090a0c] via-transparent to-[#090a0c]/70"
        />
      )}

      {/* Interactive 3-Layer Switcher Header (Showcase Mode) */}
      {allowLayerToggle && (
        <div className="relative z-20 flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.08] bg-[#0b0c0e]/85 px-3 py-2 backdrop-blur-md">
          <div className="flex items-center gap-2 min-w-0">
            <span className="bg-brand size-1.5 shrink-0 rounded-full shadow-[0_0_8px_#ff3616]" />
            <span className="text-fg truncate font-mono text-[10px] font-semibold tracking-wider uppercase">
              {PLATE_LABEL[id]}
            </span>
            <span className="text-fg-subtle hidden truncate font-mono text-[10px] sm:inline">
              · {PLATE_SUBTITLE[id]}
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

      {/* Layer 2: Precision CAD SVG Reticle */}
      {showCadSvg && (
        <svg
          viewBox="0 0 400 400"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
          preserveAspectRatio="xMidYMid meet"
          className={cn(
            'relative z-10 block h-full w-full',
            interactive && 'transition-opacity duration-200',
            layerMode === 'ascii' && 'opacity-25',
          )}
          focusable="false"
        >
          <RegistrationFrame label={PLATE_LABEL[id]} />
          <PlateBody geometry={PLATE_GEOMETRY[id]} />
        </svg>
      )}

      {/* Layer 3: Monospace ASCII Halftone & Telemetry Matrix */}
      {(displayAscii || layerMode === 'ascii') && (
        <div
          className={cn(
            'pointer-events-none absolute inset-x-0 bottom-0 z-20 border-t border-white/[0.08] bg-[#08090b]/90 px-3 py-1.5 font-mono backdrop-blur-sm',
            layerMode === 'ascii' && ' inset-0 flex flex-col items-center justify-center py-4',
          )}
        >
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
