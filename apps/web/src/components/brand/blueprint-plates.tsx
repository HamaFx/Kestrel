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

// Chiaroscuro classical engraving backdrop and watermark engine.
// Unifies all `.webp` sculptures through a fine-grain (2.5px cell) Ordered
// Bayer 4x4 chiaroscuro + Forge Ember (#FF3616) dither pass on `<canvas>`,
// with SSR-safe `<Image>` fallback and multi-stop radial vignette masks.
import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';

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

const FOCAL_POINT: Record<BlueprintPlateId, readonly [number, number]> = {
  horus: [0.76, 0.34],
  astrolabe: [0.72, 0.44],
  aegis: [0.5, 0.34],
  sentinel: [0.28, 0.38],
  arbiter: [0.5, 0.45],
  warroom: [0.5, 0.45],
  eclipse: [0.58, 0.42],
  obelisk: [0.5, 0.45],
  colonnade: [0.28, 0.42],
  titan: [0.74, 0.38],
};

// Ordered 4x4 Bayer threshold matrix (normalized 0..15)
const BAYER_4X4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
] as const;

// Fine-grain 2.5px dither cell size: crisp micro-pixel texture without blocky 8-bit distortion.
const DITHER_CELL_PX = 2.5;

interface BlueprintPlateProps {
  id: BlueprintPlateId;
  className?: string;
  interactive?: boolean;
  /** Kept for prop compatibility; classical engraving is always rendered. */
  showRasterBackup?: boolean;
  /**
   * Presentation variant:
   * - `'backdrop'`: wide section backdrop with fine-grain Bayer 4x4 dither and soft edge feathering.
   * - `'watermark'`: focal-cropped sculpture emblem with a multi-stop radial vignette mask.
   */
  variant?: 'backdrop' | 'watermark';
}

const RASTER_BACKDROP_CLASS: Record<BlueprintPlateId, string> = {
  horus: 'object-contain object-right-top brightness-[0.84] contrast-[1.28] lg:object-right',
  astrolabe: 'object-contain object-right-top brightness-[0.84] contrast-[1.28]',
  aegis: 'object-contain object-center brightness-[0.80] contrast-[1.35] grayscale',
  sentinel:
    'object-contain object-left-top brightness-[0.84] contrast-[1.28] lg:object-cover lg:object-left',
  arbiter: 'object-contain object-center brightness-[0.84] contrast-[1.28]',
  warroom: 'object-contain object-center brightness-[0.84] contrast-[1.28]',
  eclipse: 'object-contain object-center brightness-[0.84] contrast-[1.28]',
  obelisk: 'object-contain object-center brightness-[0.84] contrast-[1.28]',
  colonnade: 'object-contain object-left-top brightness-[0.84] contrast-[1.28]',
  titan:
    'object-contain object-right-top brightness-[0.84] contrast-[1.28] lg:object-cover lg:object-right',
};

const RASTER_WATERMARK_CLASS: Record<BlueprintPlateId, string> = {
  horus: 'object-cover object-[76%_35%] brightness-[0.84] contrast-[1.28]',
  astrolabe: 'object-cover object-[74%_48%] brightness-[0.84] contrast-[1.28]',
  aegis: 'object-cover object-[50%_34%] brightness-[0.80] contrast-[1.35] grayscale',
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
  '[mask-image:radial-gradient(ellipse_76%_72%_at_54%_46%,rgba(0,0,0,1)_22%,rgba(0,0,0,0.72)_50%,rgba(0,0,0,0.18)_72%,transparent_86%)] [-webkit-mask-image:radial-gradient(ellipse_76%_72%_at_54%_46%,rgba(0,0,0,1)_22%,rgba(0,0,0,0.72)_50%,rgba(0,0,0,0.18)_72%,transparent_86%)]';

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

function renderBayerDitherToCanvas(
  canvas: HTMLCanvasElement,
  sourceImage: HTMLImageElement,
  focalPoint: readonly [number, number],
  cellPx: number,
) {
  const rect = canvas.getBoundingClientRect();
  const cols = Math.max(32, Math.min(480, Math.round(rect.width / cellPx)));
  const rows = Math.max(32, Math.min(480, Math.round(rect.height / cellPx)));

  if (canvas.width !== cols || canvas.height !== rows) {
    canvas.width = cols;
    canvas.height = rows;
  }

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return;

  ctx.clearRect(0, 0, cols, rows);

  // Focal-point cover framing so the sculpture fills the plate cleanly
  const imgW = sourceImage.naturalWidth || sourceImage.width;
  const imgH = sourceImage.naturalHeight || sourceImage.height;
  if (!imgW || !imgH) return;

  const scale = Math.max(cols / imgW, rows / imgH);
  const drawW = imgW * scale;
  const drawH = imgH * scale;
  const offsetX = (cols - drawW) * focalPoint[0];
  const offsetY = (rows - drawH) * focalPoint[1];

  ctx.drawImage(sourceImage, offsetX, offsetY, drawW, drawH);

  const frame = ctx.getImageData(0, 0, cols, rows);
  const data = frame.data;

  for (let y = 0; y < rows; y += 1) {
    const bayerRow = BAYER_4X4[y & 3]!;
    for (let x = 0; x < cols; x += 1) {
      const idx = (y * cols + x) * 4;
      const r = data[idx]!;
      const g = data[idx + 1]!;
      const b = data[idx + 2]!;
      const a = data[idx + 3]!;

      if (a < 24) {
        data[idx + 3] = 0;
        continue;
      }

      // Perceived luminance with obsidian black-point floor
      const rawLum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      const contrastLum = Math.max(0, Math.min(1, (rawLum - 0.085) * 1.26));

      // Detect warm orange/gold accents in the source sculpture for #FF3616 ember quantization
      const isEmberAccent = r - b > 38 && r > g * 1.12 && r > 92;

      // Ordered Bayer 4x4 threshold modulation (intensity ~1.08)
      const threshold = (bayerRow[x & 3]! / 16 - 0.5) * 0.34;
      const level = contrastLum + threshold;

      if (level < 0.15) {
        // Pure obsidian void (transparent into #121212 background)
        data[idx + 3] = 0;
      } else if (level < 0.37) {
        // Deep architectural shadow
        data[idx] = 36;
        data[idx + 1] = 39;
        data[idx + 2] = 44;
        data[idx + 3] = 185;
      } else if (level < 0.65) {
        // Milled warm slate midtone or warm copper dither
        if (isEmberAccent) {
          data[idx] = 198;
          data[idx + 1] = 58;
          data[idx + 2] = 28;
          data[idx + 3] = 230;
        } else {
          data[idx] = 108;
          data[idx + 1] = 112;
          data[idx + 2] = 120;
          data[idx + 3] = 215;
        }
      } else if (isEmberAccent) {
        // High-chroma Kestrel Forge Ember (#FF3616)
        data[idx] = 255;
        data[idx + 1] = 54;
        data[idx + 2] = 22;
        data[idx + 3] = 252;
      } else {
        // Alabaster stone highlight (#E6E4DD)
        data[idx] = 230;
        data[idx + 1] = 228;
        data[idx + 2] = 221;
        data[idx + 3] = 242;
      }
    }
  }

  ctx.putImageData(frame, 0, 0);
}

export function BlueprintPlate({
  id,
  className,
  variant = 'watermark',
}: BlueprintPlateProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [ditherReady, setDitherReady] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let cancelled = false;
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    const focal = FOCAL_POINT[id];
    const cellSize = variant === 'backdrop' ? DITHER_CELL_PX : 2.25;

    const paint = () => {
      if (cancelled || !img.complete || img.naturalWidth === 0) return;
      renderBayerDitherToCanvas(canvas, img, focal, cellSize);
      setDitherReady(true);
    };

    img.onload = paint;
    img.src = RASTER_BACKUP[id];

    const observer = new ResizeObserver(() => {
      paint();
    });
    observer.observe(canvas);

    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [id, variant]);

  const maskClass = variant === 'backdrop' ? BACKDROP_RADIAL_MASK : WATERMARK_RADIAL_MASK;

  return (
    <div
      className={cn(
        'pointer-events-none relative isolate overflow-hidden select-none',
        maskClass,
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
          'mix-blend-screen transition-opacity duration-500',
          ditherReady ? 'opacity-0' : 'opacity-100',
          variant === 'backdrop' ? RASTER_BACKDROP_CLASS[id] : RASTER_WATERMARK_CLASS[id],
        )}
      />
      <canvas
        ref={canvasRef}
        className={cn(
          'absolute inset-0 h-full w-full mix-blend-screen transition-opacity duration-500 [image-rendering:pixelated]',
          ditherReady ? 'opacity-100' : 'opacity-0',
        )}
      />
    </div>
  );
}
