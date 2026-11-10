// SPDX-License-Identifier: Apache-2.0

// Vector geometry, chiaroscuro raster pairings, and telemetry matrices for
// Kestrel's 3-Layer Sovereign Blueprint Plates.

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
  struct: 'rgba(255,255,255,0.28)',
  ghost: 'rgba(255,255,255,0.12)',
  callout: 'rgba(255,255,255,0.58)',
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
  animated?: boolean;
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
    { d: 'M 40 292 L 200 112 L 360 292 Z', stroke: struct, width: 0.9 },
    { d: 'M 68 292 L 200 142 L 332 292', stroke: ghost, dash: '2 4' },
    { d: 'M 32 292 H 368 M 44 302 H 356 M 58 312 H 342', stroke: struct, width: 0.6 },
    { d: 'M 138 205 Q 200 158 262 205 Q 200 252 138 205 Z', stroke: struct, width: 0.9 },
    { d: 'M 200 186 L 212 205 L 200 224 L 188 205 Z', fill: brand, fillOpacity: 0.92 },
    {
      d: 'M 64 332 C 112 332 132 300 172 296 S 244 286 282 268 S 330 254 344 240',
      stroke: bull,
      width: 1.3,
      animated: true,
    },
    {
      d: 'M 64 240 C 110 244 138 266 178 270 S 248 292 288 304 S 328 318 344 332',
      stroke: warn,
      width: 0.9,
      dash: '3 3',
    },
  );
  g.circles.push(
    { cx: 200, cy: 205, r: 128, stroke: ghost, dash: '2 4' },
    { cx: 200, cy: 205, r: 84, stroke: struct, width: 0.6 },
    { cx: 200, cy: 205, r: 48, stroke: struct, width: 0.85 },
    { cx: 200, cy: 205, r: 4, fill: brand },
    { cx: 344, cy: 240, r: 3.5, fill: bull },
  );
  g.ticks.push(
    { radius: 138, count: 60, length: 6, color: struct, width: 0.5 },
    { radius: 92, count: 24, length: 4, color: ghost, width: 0.4 },
  );
  g.labels.push(
    { x: 60, y: 346, text: 'US10Y REAL YIELD', fill: bull },
    { x: 312, y: 234, text: 'DXY INVERSE', fill: warn },
    { x: 200, y: 356, text: 'MACRO HORIZON // OCULAR PEDIMENT', anchor: 'middle' },
  );
  return g;
}

function astrolabe(): PlateGeometry {
  const g = base();
  const nodes: Array<[number, number, string]> = [
    [88, 282, 'PDL'],
    [128, 240, 'HL'],
    [164, 258, 'SWEEP'],
    [208, 200, 'BOS'],
    [252, 226, 'HL'],
    [304, 150, 'PDH'],
  ];
  g.circles.push(
    { cx: 200, cy: 200, r: 146, stroke: struct, width: 0.85 },
    { cx: 200, cy: 200, r: 96, stroke: struct, width: 0.6 },
    { cx: 200, cy: 200, r: 46, stroke: struct, width: 0.6 },
  );
  g.ticks.push(
    { radius: 162, count: 72, length: 7, color: struct, width: 0.55 },
    { radius: 146, count: 36, length: 4, offset: 5, color: ghost, width: 0.45 },
  );
  g.lines.push(
    { x1: 200, y1: 28, x2: 200, y2: 372, stroke: ghost, width: 0.5 },
    { x1: 28, y1: 200, x2: 372, y2: 200, stroke: ghost, width: 0.5 },
  );
  g.ellipses.push(
    { cx: 200, cy: 200, rx: 160, ry: 62, stroke: ghost, dash: '3 4', transform: 'rotate(-24 200 200)' },
    { cx: 200, cy: 200, rx: 160, ry: 62, stroke: ghost, dash: '2 5', transform: 'rotate(32 200 200)' },
  );
  g.paths.push(
    {
      d: 'M 200 200 A 12 12 0 0 1 212 200 A 20 20 0 0 1 192 200 A 32 32 0 0 1 224 200 A 52 52 0 0 1 172 200 A 84 84 0 0 1 256 200',
      stroke: warn,
      width: 0.85,
    },
    {
      d: 'M 88 282 L 128 240 L 164 258 L 208 200 L 252 226 L 304 150',
      stroke: bull,
      width: 1.4,
      animated: true,
    },
  );
  nodes.forEach(([x, y, label], i) => {
    const focal = i === 3 || i === 5;
    g.circles.push({
      cx: x,
      cy: y,
      r: focal ? 4 : 2.5,
      fill: i === 3 ? brand : i === 5 ? bull : '#0a0b0d',
      stroke: i === 3 ? brand : i === 5 ? bull : struct,
      width: 0.9,
    });
    g.labels.push({ x: x + 6, y: y - 6, text: label });
  });
  g.labels.push(
    { x: 292, y: 196, text: 'FIB 1.618', fill: warn },
    { x: 200, y: 356, text: 'ARMILLARY STRUCTURE // SWING GEOMETRY', anchor: 'middle' },
  );
  return g;
}

function aegis(): PlateGeometry {
  const g = base();
  g.polygons.push(
    { points: octagon(164), stroke: struct, width: 0.9 },
    { points: octagon(142), stroke: ghost, dash: '2 4' },
  );
  g.circles.push({ cx: 200, cy: 200, r: 116, stroke: struct, width: 0.65 });
  g.ticks.push({ radius: 124, count: 48, length: 5, color: struct, width: 0.45 });
  g.paths.push(
    { d: 'M 200 306 L 118 132 M 200 306 L 200 118 M 200 306 L 282 132', stroke: ghost },
    { d: 'M 134 170 A 118 118 0 0 1 266 170', stroke: ghost, dash: '3 3' },
    { d: 'M 102 228 A 112 112 0 0 1 268 148', stroke: bull, width: 1.5, animated: true },
    { d: 'M 58 148 H 342', stroke: bear, width: 1.25 },
    { d: 'M 80 148 A 120 120 0 0 1 320 148', stroke: bear, dash: '2 4' },
    { d: 'M 200 148 L 200 132', stroke: brand, width: 1.6 },
  );
  g.rects.push({ x: 142, y: 60, w: 116, h: 18, stroke: bear, width: 0.7 });
  g.circles.push({ cx: 200, cy: 148, r: 4, fill: brand }, { cx: 200, cy: 306, r: 3.5, fill: bull });
  g.labels.push(
    { x: 200, y: 72, text: 'MAX RISK <= 1.00%', anchor: 'middle', fill: bear },
    { x: 210, y: 142, text: 'HARD VETO CEILING', fill: brand },
    { x: 200, y: 348, text: 'AEGIS // OCTAGONAL DRAWDOWN SHIELD', anchor: 'middle' },
  );
  return g;
}

function sentinel(): PlateGeometry {
  const g = base();
  const columns = [90, 163, 236, 310];
  g.ticks.push({ radius: 164, count: 60, length: 5, color: ghost, width: 0.4 });
  g.paths.push(
    { d: 'M 54 118 L 200 66 L 346 118 Z', stroke: struct, width: 0.85 },
    { d: 'M 62 118 H 338 M 70 128 H 330 M 78 138 H 322', stroke: struct, width: 0.75 },
    { d: 'M 54 294 H 346 M 46 304 H 354', stroke: struct, width: 0.65 },
    { d: 'M 62 338 H 338', stroke: ghost, dash: '2 4' },
    {
      d: 'M 74 256 C 122 248, 168 214, 224 196 S 292 174, 328 164',
      stroke: bull,
      width: 1.35,
      animated: true,
    },
  );
  columns.forEach((x) => {
    g.rects.push(
      { x: x - 17, y: 146, w: 34, h: 9, stroke: struct, width: 0.65 },
      { x: x - 11, y: 155, w: 22, h: 130, stroke: struct, width: 0.8 },
    );
  });
  for (let i = 0; i < 12; i++) {
    const x = 74 + i * 21;
    const inst = 12 + ((i * 7) % 24);
    const comm = 8 + ((i * 5) % 18);
    g.rects.push(
      { x, y: 338 - inst, w: 8, h: inst, fill: bull, fillOpacity: 0.48 },
      { x: x + 9, y: 338, w: 8, h: comm, fill: bear, fillOpacity: 0.38 },
    );
  }
  g.circles.push({ cx: 200, cy: 94, r: 4, fill: brand }, { cx: 328, cy: 164, r: 3.5, fill: bull });
  g.labels.push(
    { x: 200, y: 56, text: 'CFTC COT // 4-COLUMN STOA', anchor: 'middle' },
    { x: 200, y: 368, text: 'MANAGED MONEY NET LONG VS. CROWD', anchor: 'middle' },
  );
  return g;
}

function arbiter(): PlateGeometry {
  const g = base();
  g.circles.push(
    { cx: 200, cy: 200, r: 132, stroke: struct, width: 0.8 },
    { cx: 200, cy: 200, r: 84, stroke: struct, width: 0.75 },
    { cx: 200, cy: 200, r: 4, fill: brand },
    { cx: 92, cy: 164, r: 3.5, fill: bull },
    { cx: 308, cy: 164, r: 3.5, fill: bull },
  );
  g.paths.push(
    { d: 'M 200 44 V 356', stroke: brand, width: 1.2 },
    { d: 'M 92 164 H 308', stroke: struct, width: 1.1 },
    { d: 'M 92 164 L 68 228 H 116 Z M 308 164 L 284 228 H 332 Z', stroke: struct, width: 0.85 },
    {
      d: 'M 44 52 H 128 V 156 H 200 M 356 52 H 272 V 156 H 200 M 44 348 H 128 V 244 H 200 M 356 348 H 272 V 244 H 200',
      stroke: bull,
      width: 1,
      animated: true,
    },
    { d: 'M 200 138 L 254 170 L 254 230 L 200 262 L 146 230 L 146 170 Z', stroke: struct, width: 1.1 },
    { d: 'M 200 176 L 224 200 L 200 224 L 176 200 Z', fill: brand, fillOpacity: 0.28, stroke: brand, width: 1 },
  );
  g.ticks.push(
    { radius: 148, count: 64, length: 6, color: struct, width: 0.5 },
    { radius: 92, count: 32, length: 4, color: ghost, width: 0.4 },
  );
  g.labels.push(
    { x: 48, y: 44, text: '01 // MACRO (88%)', fill: bull },
    { x: 352, y: 44, text: '02 // STRUCTURE (94%)', anchor: 'end', fill: bull },
    { x: 48, y: 364, text: '04 // COT FLOW (86%)', fill: bull },
    { x: 352, y: 364, text: '03 // RISK CAP (<=1%)', anchor: 'end', fill: brand },
    { x: 200, y: 118, text: 'ARBITER SCALES // 4/4 VERIFIED SEAL', anchor: 'middle' },
  );
  return g;
}

function warroom(): PlateGeometry {
  const g = base();
  g.circles.push(
    { cx: 200, cy: 200, r: 148, stroke: struct, width: 0.85 },
    { cx: 200, cy: 200, r: 108, stroke: ghost, dash: '3 3' },
    { cx: 200, cy: 200, r: 54, stroke: struct, width: 0.95 },
    { cx: 200, cy: 200, r: 4, fill: brand },
  );
  g.ellipses.push({ cx: 200, cy: 200, rx: 156, ry: 72, stroke: struct, width: 0.7 });
  g.lines.push(
    { x1: 52, y1: 200, x2: 348, y2: 200, stroke: ghost, width: 0.5 },
    { x1: 200, y1: 52, x2: 200, y2: 348, stroke: ghost, width: 0.5 },
  );
  g.ticks.push({ radius: 148, count: 64, length: 6, color: struct, width: 0.5 });
  g.labels.push(
    { x: 200, y: 44, text: 'PANTHEON OCULUS // WAR ROOM', anchor: 'middle' },
    { x: 200, y: 364, text: 'SYNCHRONIZED COUNCIL TABLE', anchor: 'middle' },
  );
  return g;
}

function eclipse(): PlateGeometry {
  const g = base();
  g.circles.push(
    { cx: 200, cy: 172, r: 112, stroke: ghost, dash: '2 4' },
    { cx: 200, cy: 172, r: 78, stroke: struct, width: 0.9 },
    { cx: 200, cy: 172, r: 54, stroke: brand, width: 1.1 },
    { cx: 200, cy: 172, r: 4, fill: brand },
    { cx: 336, cy: 124, r: 3.5, fill: bull },
    { cx: 344, cy: 196, r: 3.5, fill: brand },
  );
  g.ticks.push(
    { radius: 132, count: 60, length: 6, color: struct, width: 0.5 },
    { radius: 86, count: 36, length: 5, color: brand, width: 0.45 },
  );
  g.paths.push(
    { d: 'M 44 304 H 356', stroke: struct, width: 0.8 },
    { d: 'M 200 172 L 336 124 M 200 172 L 344 196', stroke: brand, width: 0.9, dash: '3 3' },
    { d: 'M 52 324 C 110 318 148 264 200 244 S 276 184 348 168', stroke: bull, width: 1.4, animated: true },
  );
  g.labels.push(
    { x: 200, y: 52, text: 'ECLIPSE CORONA // 24/7 SESSION RADAR', anchor: 'middle' },
    { x: 338, y: 116, text: 'TELEGRAM BRIEFING', anchor: 'end', fill: bull },
    { x: 200, y: 356, text: 'LONDON & NEW YORK KILLZONE DISPATCH', anchor: 'middle' },
  );
  return g;
}

function obelisk(): PlateGeometry {
  const g = base();
  g.ticks.push(
    { radius: 148, count: 60, length: 6, color: struct, width: 0.5 },
    { radius: 102, count: 24, length: 4, color: ghost, width: 0.4 },
  );
  g.paths.push(
    { d: 'M 200 52 L 220 92 L 230 320 H 170 L 180 92 Z', stroke: struct, width: 0.95 },
    { d: 'M 200 52 V 340', stroke: brand, width: 1.2 },
    { d: 'M 48 320 H 352 M 68 332 H 332', stroke: struct, width: 0.7 },
    {
      d: 'M 64 296 L 106 296 L 106 258 L 154 258 L 154 270 L 200 270 L 200 212 L 262 212 L 262 162 L 336 162',
      stroke: bull,
      width: 1.45,
      animated: true,
    },
  );
  g.circles.push(
    { cx: 200, cy: 172, r: 102, stroke: struct, width: 0.65 },
    { cx: 200, cy: 52, r: 4, fill: brand },
    { cx: 336, cy: 162, r: 3.5, fill: bull },
  );
  g.labels.push(
    { x: 200, y: 40, text: 'MERIDIAN OBELISK // TICK PAPER BROKER', anchor: 'middle' },
    { x: 336, y: 150, text: '+3.64R EXPECTANCY', anchor: 'end', fill: bull },
    { x: 200, y: 358, text: 'LIVE TICK FILL & R-MULTIPLE LEDGER', anchor: 'middle' },
  );
  return g;
}

function colonnade(): PlateGeometry {
  const g = sentinel();
  g.paths.push(
    { d: 'M 68 282 C 120 272, 174 238, 232 204 S 296 156, 332 138', stroke: brand, width: 1.4, animated: true },
    { d: 'M 68 288 C 120 280, 174 256, 232 232 S 296 198, 332 184', stroke: struct, width: 0.9, dash: '3 3' },
  );
  g.circles.push({ cx: 332, cy: 138, r: 3.5, fill: brand });
  g.labels[0] = { x: 200, y: 54, text: 'BACKTESTING LAB // PARAMETER SWEEP', anchor: 'middle' };
  g.labels[1] = { x: 200, y: 368, text: 'SHARPE · SORTINO · MONTE CARLO FAN', anchor: 'middle' };
  return g;
}

function titan(): PlateGeometry {
  const g = astrolabe();
  g.polygons.push({ points: octagon(156), stroke: struct, width: 0.85 });
  g.labels.push({ x: 200, y: 44, text: 'ATLAS CELESTIAL VAULT // 18 MARKETS', anchor: 'middle' });
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
  horus: 'BP-01 // OCULAR PEDIMENT',
  astrolabe: 'BP-02 // ARMILLARY COMPASS',
  aegis: 'BP-03 // AEGIS GOVERNOR',
  sentinel: 'BP-04 // STOA ORDERFLOW',
  arbiter: 'BP-05 // ARBITER SCALES',
  warroom: 'BP-06 // PANTHEON ROTUNDA',
  eclipse: 'BP-07 // ECLIPSE RADAR',
  obelisk: 'BP-08 // MERIDIAN OBELISK',
  colonnade: 'BP-09 // SWEEP COLONNADE',
  titan: 'BP-10 // ATLAS VAULT',
};

export const PLATE_SUBTITLE: Record<BlueprintPlateId, string> = {
  horus: 'Horus Pediment & Real-Yield Horizon',
  astrolabe: 'Armillary Sphere & Swing Structure',
  aegis: 'Spartan Governor & 1.00% Risk Shield',
  sentinel: 'Classical Stoa & CFTC COT Positioning',
  arbiter: 'Arbiter Scales & 4-Desk Verdict Seal',
  warroom: 'Pantheon Oculus & War Room Chamber',
  eclipse: 'Eclipse Corona & Session Killzone Radar',
  obelisk: 'Meridian Obelisk & R-Multiple Expectancy',
  colonnade: 'Classical Colonnade & Parameter Sweep',
  titan: 'Atlas Celestial Vault & 18-Symbol Catalog',
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
  horus: ['DESK-01 // HORUS · REAL YIELD & CENTRAL BANK HORIZON', 'US10Y 4.28% (-4.2bp)  │  DXY 104.12  │  TAILWIND 88%'],
  astrolabe: ['DESK-02 // ASTROLABE · MULTI-TIMEFRAME SWING GEOMETRY', '4H/15M EMA STACK      │  PDH 2,878.4 │  FIB 0.618 LOCKED'],
  aegis: ['DESK-03 // AEGIS · 1.00% EQUITY DRAWDOWN GOVERNOR', 'MAX RISK <= 1.00%     │  ATR-14 STOP │  R:R 1:3.22 PASS'],
  sentinel: ['DESK-04 // SENTINEL · CFTC COT INSTITUTIONAL FLOW', 'MANAGED MONEY +18,420 │  74TH PCTL   │  RETAIL 64% SHORT'],
  arbiter: ['ARBITER SEAL // 4-DESK CONVERGENCE & VERIFIED TICKET', '4/4 DESKS ALIGNED     │  RISK 0.85%  │  PAYOFF 1:3.64 R:R'],
  warroom: ['PANTHEON ROTUNDA // SYNCHRONIZED WAR ROOM TELEMETRY', 'OCULUS FEED ACTIVE    │  4 DESKS ON  │  CONSENSUS 94.0%'],
  eclipse: ['ECLIPSE RADAR // 24/7 TELEGRAM WAR ROOM & ALERTS', 'LON×NY OVERLAP ACTIVE │  OPEN BRIEF  │  INSTANT TRIGGERS'],
  obelisk: ['MERIDIAN OBELISK // LIVE TICK PAPER BROKER & JOURNAL', 'TICK SL/TP FILLS      │  R-CURVE     │  ZERO CAPITAL RISK'],
  colonnade: ['SWEEP COLONNADE // HISTORICAL STRATEGY BACKTESTING LAB', 'PARALLEL GRID SEARCH  │  SHARPE 2.41 │  MAX DD VERIFIED'],
  titan: ['ATLAS CELESTIAL VAULT // 18 MARKETS · ZERO-MARKUP BYOK', 'XAUUSD · 11 FX · 6 CR │  AES-256-GCM │  RAW API COST ONLY'],
};
