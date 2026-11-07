// SPDX-License-Identifier: Apache-2.0

// Vector geometry, chiaroscuro raster pairings, and ASCII telemetry matrices
// for Kestrel's 3-Layer Sovereign Blueprint Plates (9 original engravings +
// 4 newly commissioned engravings).

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

export const PALETTE = {
  struct: 'rgba(255,255,255,0.22)',
  ghost: 'rgba(255,255,255,0.09)',
  callout: 'rgba(255,255,255,0.48)',
  brand: 'var(--color-brand)',
  bull: 'var(--color-bull)',
  bear: 'var(--color-bear)',
  warn: 'var(--color-warn)',
  mono: 'var(--font-mono)',
} as const;

export interface Shape {
  d?: string;
  cx?: number;
  cy?: number;
  r?: number;
  rx?: number;
  ry?: number;
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  points?: string;
  stroke?: string;
  width?: number;
  dash?: string;
  fill?: string;
  fillOpacity?: number;
  opacity?: number;
  transform?: string;
}

export interface LabelSpec {
  x: number;
  y: number;
  text: string;
  anchor?: 'start' | 'middle' | 'end';
  fill?: string;
}

export interface TickSpec {
  radius: number;
  count: number;
  length: number;
  offset?: number;
  color?: string;
  width?: number;
  opacity?: number;
}

export interface PlateGeometry {
  paths: Shape[];
  circles: Shape[];
  ellipses: Shape[];
  polygons: Shape[];
  lines: Shape[];
  rects: Shape[];
  ticks: TickSpec[];
  labels: LabelSpec[];
}

const { struct, ghost, brand, bull, bear, warn } = PALETTE;

const base = (): PlateGeometry => ({
  paths: [],
  circles: [],
  ellipses: [],
  polygons: [],
  lines: [],
  rects: [],
  ticks: [],
  labels: [],
});

function octagon(radius: number): string {
  return Array.from({ length: 8 }, (_, i) => {
    const rad = ((22.5 + i * 45 - 90) * Math.PI) / 180;
    return `${Number((200 + radius * Math.cos(rad)).toFixed(2))},${Number((200 + radius * Math.sin(rad)).toFixed(2))}`;
  }).join(' ');
}

function horus(): PlateGeometry {
  const g = base();
  g.paths.push(
    { d: 'M 40 292 L 200 112 L 360 292 Z', stroke: struct, width: 0.75 },
    { d: 'M 68 292 L 200 142 L 332 292', stroke: ghost, dash: '2 4' },
    { d: 'M 32 292 H 368 M 44 302 H 356 M 58 312 H 342', stroke: struct, width: 0.5 },
    { d: 'M 138 205 Q 200 158 262 205 Q 200 252 138 205 Z', stroke: struct, width: 0.75 },
    { d: 'M 200 186 L 212 205 L 200 224 L 188 205 Z', fill: brand, fillOpacity: 0.9 },
    {
      d: 'M 64 332 C 112 332 132 300 172 296 S 244 286 282 268 S 330 254 344 240',
      stroke: bull,
      width: 0.9,
    },
    {
      d: 'M 64 240 C 110 244 138 266 178 270 S 248 292 288 304 S 328 318 344 332',
      stroke: warn,
      width: 0.7,
      dash: '3 3',
    },
  );
  g.circles.push(
    { cx: 200, cy: 205, r: 128, stroke: ghost, dash: '2 4' },
    { cx: 200, cy: 205, r: 84, stroke: struct, width: 0.5 },
    { cx: 200, cy: 205, r: 48, stroke: struct, width: 0.75 },
  );
  g.ticks.push({ radius: 134, count: 60, length: 5, color: struct, width: 0.4 });
  g.labels.push(
    { x: 60, y: 346, text: 'US10Y' },
    { x: 316, y: 248, text: 'DXY' },
    { x: 200, y: 352, text: 'REAL YIELD HORIZON', anchor: 'middle' },
  );
  return g;
}

function astrolabe(): PlateGeometry {
  const g = base();
  const nodes: Array<[number, number, string]> = [
    [88, 282, 'PDL'],
    [128, 240, 'HL'],
    [164, 258, 'HL'],
    [208, 200, 'HH'],
    [252, 226, 'HL'],
    [304, 150, 'PDH'],
  ];
  g.circles.push(
    { cx: 200, cy: 200, r: 146, stroke: struct, width: 0.75 },
    { cx: 200, cy: 200, r: 96, stroke: struct, width: 0.5 },
    { cx: 200, cy: 200, r: 46, stroke: struct, width: 0.5 },
  );
  g.ticks.push(
    { radius: 162, count: 72, length: 7, color: struct, width: 0.5 },
    { radius: 146, count: 24, length: 4, offset: 7.5, color: ghost, width: 0.4 },
  );
  g.lines.push(
    { x1: 200, y1: 28, x2: 200, y2: 372, stroke: ghost, width: 0.5 },
    { x1: 28, y1: 200, x2: 372, y2: 200, stroke: ghost, width: 0.5 },
  );
  g.ellipses.push({
    cx: 200,
    cy: 200,
    rx: 160,
    ry: 62,
    stroke: ghost,
    dash: '3 4',
    transform: 'rotate(-24 200 200)',
  });
  g.paths.push(
    {
      d: 'M 200 200 A 12 12 0 0 1 212 200 A 20 20 0 0 1 192 200 A 32 32 0 0 1 224 200 A 52 52 0 0 1 172 200 A 84 84 0 0 1 256 200',
      stroke: warn,
      width: 0.7,
    },
    { d: 'M 88 282 L 128 240 L 164 258 L 208 200 L 252 226 L 304 150', stroke: bull, width: 1.1 },
  );
  nodes.forEach(([x, y, label], i) => {
    const focal = i === 3;
    g.circles.push({
      cx: x,
      cy: y,
      r: focal ? 4 : 2.5,
      fill: focal ? brand : 'transparent',
      stroke: focal ? brand : struct,
      width: 0.75,
    });
    g.labels.push({ x: x + 6, y: y - 6, text: label });
  });
  g.labels.push(
    { x: 292, y: 196, text: '1.618' },
    { x: 304, y: 320, text: 'GOLDEN RATIO', anchor: 'end' },
  );
  return g;
}

function aegis(): PlateGeometry {
  const g = base();
  g.polygons.push(
    { points: octagon(166), stroke: struct, width: 0.75 },
    { points: octagon(146), stroke: ghost, dash: '2 4' },
  );
  g.circles.push({ cx: 200, cy: 200, r: 118, stroke: struct, width: 0.5 });
  g.paths.push(
    { d: 'M 200 306 L 118 132 M 200 306 L 200 118 M 200 306 L 282 132', stroke: ghost },
    { d: 'M 134 170 A 118 118 0 0 1 266 170', stroke: ghost, dash: '3 3' },
    { d: 'M 108 210 A 150 150 0 0 1 292 210', stroke: ghost, dash: '3 3' },
    { d: 'M 58 150 H 342', stroke: bear, width: 1.1 },
    { d: 'M 80 150 A 120 120 0 0 1 320 150', stroke: bear, dash: '2 4' },
    { d: 'M 200 150 L 200 138', stroke: brand, width: 1.5 },
  );
  g.rects.push({ x: 150, y: 62, w: 100, h: 16, stroke: bear, width: 0.5 });
  g.circles.push({ cx: 200, cy: 306, r: 3, fill: warn });
  g.labels.push(
    { x: 200, y: 73, text: 'MAX RISK 1.00%', anchor: 'middle', fill: bear },
    { x: 206, y: 152, text: 'HARD VETO CEILING' },
    { x: 200, y: 334, text: 'AEGIS · DRAWDOWN GOVERNOR', anchor: 'middle' },
  );
  return g;
}

function sentinel(): PlateGeometry {
  const g = base();
  const columns = [90, 163, 236, 310];
  g.paths.push(
    { d: 'M 62 118 H 338 M 70 128 H 330 M 78 138 H 322', stroke: struct, width: 0.75 },
    { d: 'M 54 300 H 346 M 46 310 H 354', stroke: struct, width: 0.5 },
    { d: 'M 62 344 H 338', stroke: ghost, dash: '2 4' },
  );
  columns.forEach((x) => {
    g.rects.push(
      { x: x - 17, y: 148, w: 34, h: 9, stroke: struct, width: 0.6 },
      { x: x - 11, y: 157, w: 22, h: 130, stroke: struct, width: 0.75 },
    );
  });
  for (let i = 0; i < 9; i++) {
    const x = 76 + i * 14;
    const inst = 10 + ((i * 7) % 26);
    const comm = 8 + ((i * 5) % 22);
    g.rects.push(
      { x, y: 344 - inst, w: 7, h: inst, fill: bull, fillOpacity: 0.35 },
      { x: x + 8, y: 344, w: 7, h: comm, fill: bear, fillOpacity: 0.3 },
    );
  }
  g.circles.push({ cx: 200, cy: 96, r: 3, fill: brand });
  g.labels.push(
    { x: 62, y: 108, text: 'COT ORDERFLOW · 4-COLUMN STOA' },
    { x: 200, y: 368, text: 'INSTITUTIONAL / COMMERCIAL NET', anchor: 'middle' },
  );
  return g;
}

function arbiter(): PlateGeometry {
  const g = base();
  g.circles.push(
    { cx: 200, cy: 200, r: 112, stroke: struct, width: 0.75 },
    { cx: 200, cy: 200, r: 74, stroke: struct, width: 0.75 },
    { cx: 200, cy: 200, r: 4, fill: brand },
  );
  g.paths.push(
    { d: 'M 200 44 V 356', stroke: brand, width: 1.2 },
    { d: 'M 92 164 H 308', stroke: struct, width: 1 },
    { d: 'M 92 164 L 68 228 H 116 Z M 308 164 L 284 228 H 332 Z', stroke: struct, width: 0.75 },
    {
      d: 'M 44 44 H 128 V 156 H 200 M 356 44 H 272 V 156 H 200 M 44 356 H 128 V 244 H 200 M 356 356 H 272 V 244 H 200',
      stroke: struct,
      width: 0.75,
    },
    {
      d: 'M 200 142 L 252 174 L 252 226 L 200 258 L 148 226 L 148 174 Z',
      stroke: struct,
      width: 1,
    },
    {
      d: 'M 200 178 L 222 200 L 200 222 L 178 200 Z',
      fill: brand,
      fillOpacity: 0.2,
      stroke: brand,
      width: 0.75,
    },
  );
  g.ticks.push({ radius: 118, count: 48, length: 5, color: struct, width: 0.4 });
  g.labels.push(
    { x: 54, y: 38, text: 'DESK I // HORUS' },
    { x: 346, y: 38, text: 'DESK II // ASTROLABE', anchor: 'end' },
    { x: 54, y: 374, text: 'DESK IV // SENTINEL' },
    { x: 346, y: 374, text: 'DESK III // AEGIS', anchor: 'end' },
    { x: 200, y: 112, text: 'STAGE II · ARBITER SCALES & SEAL', anchor: 'middle' },
  );
  return g;
}

function warroom(): PlateGeometry {
  const g = base();
  g.circles.push(
    { cx: 200, cy: 200, r: 148, stroke: struct, width: 0.75 },
    { cx: 200, cy: 200, r: 108, stroke: ghost, dash: '3 3' },
    { cx: 200, cy: 200, r: 54, stroke: struct, width: 0.9 },
    { cx: 200, cy: 200, r: 4, fill: brand },
  );
  g.ellipses.push({ cx: 200, cy: 200, rx: 156, ry: 72, stroke: struct, width: 0.6 });
  g.lines.push(
    { x1: 52, y1: 200, x2: 348, y2: 200, stroke: ghost, width: 0.5 },
    { x1: 200, y1: 52, x2: 200, y2: 348, stroke: ghost, width: 0.5 },
  );
  g.ticks.push({ radius: 148, count: 64, length: 6, color: struct, width: 0.45 });
  g.labels.push(
    { x: 200, y: 44, text: 'PANTHEON OCULUS // WAR ROOM', anchor: 'middle' },
    { x: 200, y: 364, text: 'SYNCHRONIZED COUNCIL TABLE', anchor: 'middle' },
  );
  return g;
}

function eclipse(): PlateGeometry {
  const g = base();
  g.circles.push(
    { cx: 246, cy: 142, r: 64, stroke: struct, width: 0.9 },
    { cx: 246, cy: 142, r: 48, stroke: brand, width: 0.8 },
    { cx: 246, cy: 142, r: 88, stroke: ghost, dash: '2 4' },
    { cx: 246, cy: 142, r: 4, fill: brand },
  );
  g.ticks.push({ radius: 72, count: 36, length: 5, color: struct, width: 0.4 });
  g.paths.push(
    { d: 'M 48 288 H 352', stroke: struct, width: 0.75 },
    { d: 'M 56 320 C 110 318 148 264 198 256 S 268 188 344 176', stroke: bull, width: 1 },
  );
  g.labels.push(
    { x: 246, y: 64, text: 'SOLAR ECLIPSE CORONA', anchor: 'middle' },
    { x: 60, y: 344, text: 'UTC KILLZONE HORIZON' },
  );
  return g;
}

function obelisk(): PlateGeometry {
  const g = base();
  g.paths.push(
    { d: 'M 200 56 L 218 92 L 228 324 H 172 L 182 92 Z', stroke: struct, width: 0.9 },
    { d: 'M 200 56 V 344', stroke: brand, width: 1.1 },
    { d: 'M 48 324 H 352 M 68 336 H 332', stroke: struct, width: 0.6 },
  );
  g.circles.push(
    { cx: 200, cy: 148, r: 96, stroke: struct, width: 0.6 },
    { cx: 200, cy: 56, r: 4, fill: brand },
  );
  g.labels.push(
    { x: 200, y: 42, text: 'PRIME MERIDIAN OBELISK', anchor: 'middle' },
    { x: 200, y: 360, text: '00:00 UTC REFERENCE AXIS', anchor: 'middle' },
  );
  return g;
}

function colonnade(): PlateGeometry {
  const g = sentinel();
  g.paths.push({ d: 'M 54 118 L 200 64 L 346 118', stroke: struct, width: 0.8 });
  g.labels.push({ x: 200, y: 54, text: 'CLASSICAL PIPELINE COLONNADE', anchor: 'middle' });
  return g;
}

function titan(): PlateGeometry {
  const g = astrolabe();
  g.polygons.push({ points: octagon(156), stroke: struct, width: 0.75 });
  g.labels.push({ x: 200, y: 46, text: 'ATLAS CELESTIAL VAULT', anchor: 'middle' });
  return g;
}

export const PLATE_GEOMETRY: Record<BlueprintPlateId, PlateGeometry> = {
  horus: horus(),
  astrolabe: astrolabe(),
  aegis: aegis(),
  sentinel: sentinel(),
  arbiter: arbiter(),
  warroom: warroom(),
  eclipse: eclipse(),
  obelisk: obelisk(),
  colonnade: colonnade(),
  titan: titan(),
};

export const PLATE_LABEL: Record<BlueprintPlateId, string> = {
  horus: 'BP-01 / OCULAR PEDIMENT',
  astrolabe: 'BP-02 / ARMILLARY',
  aegis: 'BP-03 / AEGIS GOVERNOR',
  sentinel: 'BP-04 / STOA FLOW',
  arbiter: 'BP-05 / ARBITER SCALES',
  warroom: 'BP-06 / PANTHEON WAR ROOM',
  eclipse: 'BP-07 / ECLIPSE WATCH',
  obelisk: 'BP-08 / MERIDIAN OBELISK',
  colonnade: 'BP-09 / PIPELINE COLONNADE',
  titan: 'BP-10 / ATLAS VAULT',
};

export const PLATE_SUBTITLE: Record<BlueprintPlateId, string> = {
  horus: 'Horus Statue & Obelisk Meridian',
  astrolabe: 'Armillary Sphere & Classical Colonnade',
  aegis: 'Spartan Governor & Sentinel Watch',
  sentinel: 'Council of Strategists & Pantheon Rotunda',
  arbiter: 'Arbiter Scales Falcon & Atlas Titan',
  warroom: 'Pantheon War Room & Council Chamber',
  eclipse: 'Sentinel Eclipse Watch & Killzone Horizon',
  obelisk: 'Prime Meridian Obelisk & Horus Pediment',
  colonnade: 'Stepper Colonnade & Arbiter Synthesis',
  titan: 'Atlas Celestial Titan & Arbiter Seal',
};

export const RASTER_BACKUP: Record<BlueprintPlateId, string> = {
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

export const SECONDARY_RASTER_BACKUP: Record<BlueprintPlateId, string> = {
  horus: '/landing/temple-obelisk-meridian.webp',
  astrolabe: '/landing/stepper-colonnade.webp',
  aegis: '/landing/sentinel-eclipse-watch.webp',
  sentinel: '/landing/war-room-pantheon.webp',
  arbiter: '/landing/architecture-titan.webp',
  warroom: '/landing/desks-council-strategists.webp',
  eclipse: '/landing/aegis-spartan-bust.webp',
  obelisk: '/landing/kestrel-horus-statue.webp',
  colonnade: '/landing/arbiter-scales-falcon.webp',
  titan: '/landing/arbiter-scales-falcon.webp',
};

export const PLATE_ASCII_MATRIX: Record<BlueprintPlateId, readonly string[]> = {
  horus: [
    '░░▒▒▓▓██  DESK-I // HORUS · REAL YIELD HORIZON  ██▓▓▒▒░░',
    'US10Y 4.21% (-4.2bp)  │  DXY 104.12  │  BIAS: BULLISH 88%',
  ],
  astrolabe: [
    '░░▒▒▓▓██  DESK-II // ASTROLABE · GOLDEN COMPASS ██▓▓▒▒░░',
    '4H/15M EMA STACK      │  PDH 2,878.4 │  FIB 0.618 LOCKED',
  ],
  aegis: [
    '░░▒▒▓▓██  DESK-III // AEGIS · 1.00% RISK VETO   ██▓▓▒▒░░',
    'MAX DRAWDOWN <= 1.00% │  ATR-14 STOP │  R:R 1:3.22 PASS',
  ],
  sentinel: [
    '░░▒▒▓▓██  DESK-IV // SENTINEL · COT ORDERFLOW   ██▓▓▒▒░░',
    'COMMERCIAL +18,420    │  RETAIL 64%S │  WHALE SKEW LONG',
  ],
  arbiter: [
    '░░▒▒▓▓██  STAGE II // ARBITER · SCALES & FALCON ██▓▓▒▒░░',
    '4/4 DESKS SYNCHRONIZED│  HASH #4A9F  │  VERDICT CERTIFIED',
  ],
  warroom: [
    '░░▒▒▓▓██  PANTHEON ROTUNDA · SYNDICATE CHAMBER  ██▓▓▒▒░░',
    'OCULUS TELEMETRY LIVE │  4 DESKS ON  │  CONSENSUS 91.4%',
  ],
  eclipse: [
    '░░▒▒▓▓██  SENTINEL ECLIPSE · KILLZONE HORIZON   ██▓▓▒▒░░',
    'LON×NY OVERLAP ACTIVE │  CPI T-01:14 │  VOLATILITY GUARD',
  ],
  obelisk: [
    '░░▒▒▓▓██  MERIDIAN OBELISK · SOVEREIGN AXIS     ██▓▓▒▒░░',
    '00:00 UTC ANCHOR LOCK │  BYOK AES256 │  ZERO-CUSTODY',
  ],
  colonnade: [
    '░░▒▒▓▓██  PIPELINE COLONNADE · 4-STAGE CIRCUIT  ██▓▓▒▒░░',
    'INGEST → DELIBERATE   │  VETO CHECK  │  CERTIFY DOSSIER',
  ],
  titan: [
    '░░▒▒▓▓██  ATLAS CELESTIAL VAULT · 4-TIER STACK  ██▓▓▒▒░░',
    'INGESTION · ENGINE    │  RISK SHIELD │  EXECUTION BRIDGE',
  ],
};
