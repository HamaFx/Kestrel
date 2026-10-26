// SPDX-License-Identifier: Apache-2.0
//
// PWA surface theme: the colours shared by the web app manifest, the
// `<meta name="theme-color">` chrome, the generated icons/splashes and the
// install-dialog screenshots.
//
// Values live in `pwa-theme.json` because both the Next.js app (TS) and the
// build-time asset generators (`scripts/*.mjs`, plain Node) need to read them.
// `test/pwa-brand-contract.test.ts` re-derives every value from `globals.css`
// so the JSON can never silently drift from the design tokens again.

import themeFile from './pwa-theme.json';

export interface PwaPalette {
  readonly bg: string;
  readonly bgElev1: string;
  readonly bgElev2: string;
  readonly bgElev3: string;
  readonly border: string;
  readonly fg: string;
  readonly fgMuted: string;
  readonly fgSubtle: string;
  readonly brand: string;
  readonly brandSoft: string;
  readonly bull: string;
  readonly bear: string;
  readonly info: string;
  readonly warn: string;
}

const theme = themeFile as {
  background: string;
  themeColor: string;
  palette: PwaPalette;
};

/** Splash / install-dialog background. Matches `--color-bg`. */
export const PWA_BACKGROUND = theme.background;
/** OS chrome colour for the installed app. Matches `--color-bg`. */
export const PWA_THEME_COLOR = theme.themeColor;
export const PWA_PALETTE: PwaPalette = theme.palette;
