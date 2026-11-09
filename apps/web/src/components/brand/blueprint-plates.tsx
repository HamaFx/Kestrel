'use client';

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

// Chiaroscuro classical engraving backdrop and watermark component.
// Renders preserved `.webp` classical sculptures with focal-point cropping,
// black-point contrast normalization, and multi-stop radial vignette masks
// so sculptures dissolve seamlessly into dark obsidian surfaces on both
// mobile and desktop.
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

interface BlueprintPlateProps {
  id: BlueprintPlateId;
  className?: string;
  interactive?: boolean;
  /** Kept for prop compatibility; classical engraving is always rendered. */
  showRasterBackup?: boolean;
  /**
   * Presentation variant:
   * - `'backdrop'`: wide section backdrop with directional object alignment and soft edge feathering.
   * - `'watermark'`: focal-cropped sculpture emblem with a multi-stop radial vignette mask.
   */
  variant?: 'backdrop' | 'watermark';
}

const RASTER_BACKDROP_CLASS: Record<BlueprintPlateId, string> = {
  horus:
    'object-contain object-right-top brightness-[0.84] contrast-[1.28] lg:object-right',
  astrolabe:
    'object-contain object-right-top brightness-[0.84] contrast-[1.28]',
  aegis:
    'object-contain object-center brightness-[0.80] contrast-[1.35] grayscale',
  sentinel:
    'object-contain object-left-top brightness-[0.84] contrast-[1.28] lg:object-cover lg:object-left',
  arbiter:
    'object-contain object-center brightness-[0.84] contrast-[1.28]',
  warroom:
    'object-contain object-center brightness-[0.84] contrast-[1.28]',
  eclipse:
    'object-contain object-center brightness-[0.84] contrast-[1.28]',
  obelisk:
    'object-contain object-center brightness-[0.84] contrast-[1.28]',
  colonnade:
    'object-contain object-left-top brightness-[0.84] contrast-[1.28]',
  titan:
    'object-contain object-right-top brightness-[0.84] contrast-[1.28] lg:object-cover lg:object-right',
};

const RASTER_WATERMARK_CLASS: Record<BlueprintPlateId, string> = {
  horus: 'object-cover object-[76%_35%] brightness-[0.84] contrast-[1.28]',
  astrolabe: 'object-cover object-[74%_48%] brightness-[0.84] contrast-[1.28]',
  aegis:
    'object-cover object-[50%_34%] brightness-[0.80] contrast-[1.35] grayscale',
  sentinel: 'object-cover object-[28%_38%] brightness-[0.84] contrast-[1.28]',
  arbiter: 'object-cover object-center brightness-[0.84] contrast-[1.28]',
  warroom: 'object-cover object-center brightness-[0.84] contrast-[1.28]',
  eclipse: 'object-cover object-[58%_42%] brightness-[0.84] contrast-[1.28]',
  obelisk: 'object-cover object-center brightness-[0.84] contrast-[1.28]',
  colonnade: 'object-cover object-[28%_45%] brightness-[0.84] contrast-[1.28]',
  titan: 'object-cover object-[74%_40%] brightness-[0.84] contrast-[1.28]',
};

const WATERMARK_RADIAL_MASK =
  '[mask-image:radial-gradient(ellipse_72%_70%_at_52%_50%,rgba(0,0,0,1)_18%,rgba(0,0,0,0.68)_46%,rgba(0,0,0,0.18)_68%,transparent_82%)] [-webkit-mask-image:radial-gradient(ellipse_72%_70%_at_52%_50%,rgba(0,0,0,1)_18%,rgba(0,0,0,0.68)_46%,rgba(0,0,0,0.18)_68%,transparent_82%)]';

const BACKDROP_RADIAL_MASK =
  '[mask-image:radial-gradient(ellipse_74%_70%_at_54%_46%,rgba(0,0,0,1)_20%,rgba(0,0,0,0.65)_48%,rgba(0,0,0,0.16)_70%,transparent_84%)] [-webkit-mask-image:radial-gradient(ellipse_74%_70%_at_54%_46%,rgba(0,0,0,1)_20%,rgba(0,0,0,0.65)_48%,rgba(0,0,0,0.16)_70%,transparent_84%)]';

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

export function BlueprintPlate({
  id,
  className,
  variant = 'watermark',
}: BlueprintPlateProps) {
  return (
    <div
      className={cn(
        'pointer-events-none relative isolate overflow-hidden select-none',
        className,
      )}
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
            ? cn(RASTER_BACKDROP_CLASS[id], BACKDROP_RADIAL_MASK)
            : cn(RASTER_WATERMARK_CLASS[id], WATERMARK_RADIAL_MASK),
        )}
      />
    </div>
  );
}
