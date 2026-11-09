'use client';

// SPDX-License-Identifier: Apache-2.0

// Chiaroscuro classical engraving backdrop and watermark component.
// Renders preserved `.webp` classical sculptures with focal-point cropping
// and radial vignette masks (without CAD vector reticles).
import Image from 'next/image';

import { cn } from '@/lib/formatters/cn';

export type BlueprintPlateId =
  | 'horus'
  | 'astrolabe'
  | 'aegis'
  | 'sentinel'
  | 'arbiter'
  | 'warroom'
  | 'eclipse'
  | 'obelisk'
  | 'colonnade'
  | 'titan';

const RASTER_BACKUP: Record<BlueprintPlateId, string> = {
  horus: '/landing/kestrel-horus-statue.webp',
  astrolabe: '/landing/simulator-astrolabe.webp',
  aegis: '/landing/aegis-spartan-bust.webp',
  sentinel: '/landing/desks-council-strategists.webp',
  arbiter: '/landing/arbiter-scales-falcon.webp',
  warroom: '/landing/war-room-pantheon.webp',
  eclipse: '/landing/sentinel-eclipse-watch.webp',
  obelisk: '/landing/temple-obelisk-meridian.webp',
  colonnade: '/landing/stepper-colonnade.webp',
  titan: '/landing/architecture-titan.webp',
};

export interface BlueprintPlateProps {
  id: BlueprintPlateId;
  className?: string;
  interactive?: boolean;
  /** Kept for prop compatibility; classical engraving is always rendered. */
  showRasterBackup?: boolean;
  /**
   * Presentation variant:
   * - `'backdrop'`: wide section backdrop with directional object alignment.
   * - `'watermark'`: focal-cropped sculpture emblem with a circular radial vignette mask.
   */
  variant?: 'backdrop' | 'watermark';
}

const RASTER_BACKDROP_CLASS: Record<BlueprintPlateId, string> = {
  horus: 'object-contain object-right-top lg:object-right',
  astrolabe: 'object-contain object-right-top',
  aegis: 'object-contain object-center brightness-[0.82] contrast-[1.35] grayscale',
  sentinel: 'object-contain object-left-top lg:object-cover lg:object-left',
  arbiter: 'object-contain object-center brightness-[0.85] contrast-[1.25]',
  warroom: 'object-contain object-center brightness-[0.85] contrast-[1.25]',
  eclipse: 'object-contain object-center brightness-[0.85] contrast-[1.25]',
  obelisk: 'object-contain object-center brightness-[0.85] contrast-[1.25]',
  colonnade: 'object-contain object-left-top',
  titan: 'object-contain object-right-top lg:object-cover lg:object-right',
};

const RASTER_WATERMARK_CLASS: Record<BlueprintPlateId, string> = {
  horus: 'object-cover object-[76%_35%]',
  astrolabe: 'object-cover object-[74%_48%]',
  aegis: 'object-cover object-[50%_34%] brightness-[0.82] contrast-[1.35] grayscale',
  sentinel: 'object-cover object-[28%_38%]',
  arbiter: 'object-cover object-center brightness-[0.85] contrast-[1.25]',
  warroom: 'object-cover object-center brightness-[0.85] contrast-[1.25]',
  eclipse: 'object-cover object-[58%_42%] brightness-[0.85] contrast-[1.25]',
  obelisk: 'object-cover object-center brightness-[0.85] contrast-[1.25]',
  colonnade: 'object-cover object-[28%_45%]',
  titan: 'object-cover object-[74%_40%]',
};

const WATERMARK_RADIAL_MASK =
  '[mask-image:radial-gradient(ellipse_74%_72%_at_50%_50%,black_28%,transparent_80%)]';

/**
 * Focal-point crop + contrast normalization + radial vignette mask for raw
 * `artworkPath` `<Image>` watermarks inside compact desk tiles.
 */
export function getArtworkWatermarkClass(artworkPath: string): string {
  if (artworkPath.includes('aegis-spartan-bust')) {
    return cn(RASTER_WATERMARK_CLASS.aegis, WATERMARK_RADIAL_MASK);
  }
  if (artworkPath.includes('desks-council-strategists')) {
    return cn(RASTER_WATERMARK_CLASS.sentinel, WATERMARK_RADIAL_MASK);
  }
  if (artworkPath.includes('kestrel-horus-statue')) {
    return cn(RASTER_WATERMARK_CLASS.horus, WATERMARK_RADIAL_MASK);
  }
  if (artworkPath.includes('simulator-astrolabe')) {
    return cn(RASTER_WATERMARK_CLASS.astrolabe, WATERMARK_RADIAL_MASK);
  }
  return cn(RASTER_WATERMARK_CLASS.arbiter, WATERMARK_RADIAL_MASK);
}

export function BlueprintPlate({ id, className, variant = 'watermark' }: BlueprintPlateProps) {
  return (
    <div
      className={cn('relative isolate overflow-hidden select-none', className)}
      data-blueprint={id}
      aria-hidden="true"
    >
      <Image
        src={RASTER_BACKUP[id]}
        alt=""
        fill
        unoptimized
        sizes={
          variant === 'backdrop'
            ? '(max-width: 1024px) 100vw, 56vw'
            : '(max-width: 640px) 220px, 360px'
        }
        className={cn(
          'mix-blend-screen transition-opacity duration-300',
          variant === 'backdrop'
            ? RASTER_BACKDROP_CLASS[id]
            : cn(RASTER_WATERMARK_CLASS[id], WATERMARK_RADIAL_MASK),
        )}
      />
    </div>
  );
}
