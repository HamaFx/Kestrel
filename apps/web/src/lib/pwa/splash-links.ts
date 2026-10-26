// SPDX-License-Identifier: Apache-2.0
//
// Apple launch images (`<link rel="apple-touch-startup-image">`).
//
// iOS has no manifest-driven splash screen: Safari matches the exact device
// (logical size + pixel ratio + orientation) against these media queries and
// shows the referenced PNG while the app boots. A missing or mismatched entry
// produces a white flash before the dark app shell appears, so the matrix is
// generated from `splash-devices.json` — the same file
// `scripts/generate-icons.mjs` uses to rasterise the PNGs.
//
// Reference: WebKit "Configuring Web Applications" + web.dev "Enhancements".

import devicesFile from './splash-devices.json';

export interface SplashDevice {
  readonly id: string;
  readonly label: string;
  readonly widthPt: number;
  readonly heightPt: number;
  readonly scale: number;
}

export interface SplashLink {
  /** Media query Safari matches against the current device. */
  readonly media: string;
  /** Public path of the generated PNG. */
  readonly href: string;
  /** Logical device size, for tests and tooling. */
  readonly widthPt: number;
  readonly heightPt: number;
  readonly scale: number;
  readonly orientation: 'portrait' | 'landscape';
}

export const SPLASH_DEVICES: readonly SplashDevice[] = (devicesFile as { devices: SplashDevice[] })
  .devices;

/** Physical pixel size, portrait orientation. */
export function splashPixelSize(device: SplashDevice): { width: number; height: number } {
  return { width: device.widthPt * device.scale, height: device.heightPt * device.scale };
}

/** Public file name for a device/orientation pair (portrait geometry in the name). */
export function splashFileName(
  device: SplashDevice,
  orientation: 'portrait' | 'landscape' = 'portrait',
): string {
  const { width, height } = splashPixelSize(device);
  return orientation === 'portrait'
    ? `apple-splash-${width}x${height}.png`
    : `apple-splash-${height}x${width}.png`;
}

export function splashMediaQuery(
  device: SplashDevice,
  orientation: 'portrait' | 'landscape',
): string {
  const width = orientation === 'portrait' ? device.widthPt : device.heightPt;
  const height = orientation === 'portrait' ? device.heightPt : device.widthPt;
  return [
    `(device-width: ${width}px)`,
    `(device-height: ${height}px)`,
    `(-webkit-device-pixel-ratio: ${device.scale})`,
    `(orientation: ${orientation})`,
  ].join(' and ');
}

const ORIENTATIONS = ['portrait', 'landscape'] as const;

/** Every launch-image link, portrait then landscape for each device. */
export const SPLASH_LINKS: readonly SplashLink[] = SPLASH_DEVICES.flatMap((device) =>
  ORIENTATIONS.map((orientation) => ({
    media: splashMediaQuery(device, orientation),
    href: `/icons/${splashFileName(device, orientation)}`,
    widthPt: device.widthPt,
    heightPt: device.heightPt,
    scale: device.scale,
    orientation,
  })),
);

/** Unique PNG files the icon generator must produce for the current matrix. */
export function requiredSplashFiles(): readonly string[] {
  const files = new Set<string>();
  for (const device of SPLASH_DEVICES) {
    files.add(splashFileName(device, 'portrait'));
    files.add(splashFileName(device, 'landscape'));
  }
  return [...files].sort();
}
